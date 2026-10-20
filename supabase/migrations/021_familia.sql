-- 021 — Familia: un cuidador gestiona N personas, con permiso por vínculo.
--
-- Modelo: cada persona gestionada es una cuenta REAL de auth.users (así toda
-- tabla con usuario_id sigue funcionando sin cambios). Dos maneras de llegar:
--   a) la persona tiene su celular → flujos de vínculo existentes (invitación
--      por email, código de 6 dígitos, login por código);
--   b) "perfil gestionado" (sin celular/cuenta propia) → el cuidador lo crea
--      desde la app: la Server Action crea una cuenta con email placeholder
--      (mismo dominio que las cuentas por código, lib/acceso-codigo/), su
--      `perfiles` y un vínculo YA aceptado con rol 'editar' (lib/familia/
--      nucleo.ts, cliente admin). Más adelante esa persona puede usar su
--      celular con el código de acceso existente (codigos_acceso) — ningún
--      mecanismo de auth nuevo.
--
-- 1. vinculos_cuidador.rol ('editar' | 'ver') — qué puede hacer el CUIDADOR.
--    Lo decide la persona cuidada (dueña de la cuenta) vía
--    cambiar_rol_cuidador(). Default 'editar' = comportamiento previo (los
--    vínculos existentes no pierden nada). vinculos_cuidador.relacion: texto
--    libre opcional ("Mamá"), dato del vínculo, no de la persona.
-- 2. perfiles.color: clave de paleta (la UI la mapea a tokens).
-- 3. Helpers es_cuidador_de / puede_editar_de (security definer, stable):
--    ignoran explícitamente cualquier fila autovinculada (016).
-- 4. RLS aditiva del cuidador: lectura con cualquier rol, escritura solo con
--    'editar'. Las policies `_all_self` de cada tabla NO se tocan. Las
--    policies de cuidador de 008/010/014 se reemplazan (drop + create) porque
--    no distinguían rol: un cuidador 'ver' podía crear medicamentos.
-- 5. perfiles: el cuidador 'editar' puede hacer UPDATE, y un trigger impide
--    que toque columnas que no son de salud (uso_app, onboarding, avatar…).
-- 6. RPCs: listar_familia, listar_mis_cuidadores, cambiar_rol_cuidador,
--    dejar_de_cuidar. Todas `returns table` con columnas calificadas (011).

-- 1 · columnas ------------------------------------------------------------------

alter table vinculos_cuidador
  add column rol text not null default 'editar' check (rol in ('editar', 'ver')),
  add column relacion text;

alter table perfiles
  add column color text check (color in ('teal', 'violeta', 'ambar', 'rosa', 'azul'));

-- 2 · helpers ------------------------------------------------------------------

create or replace function es_cuidador_de(p_elder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vinculos_cuidador vc
    where vc.elder_id = p_elder
      and vc.cuidador_id = auth.uid()
      and vc.estado = 'aceptado'
      and vc.cuidador_id <> vc.elder_id
  );
$$;

create or replace function puede_editar_de(p_elder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vinculos_cuidador vc
    where vc.elder_id = p_elder
      and vc.cuidador_id = auth.uid()
      and vc.estado = 'aceptado'
      and vc.rol = 'editar'
      and vc.cuidador_id <> vc.elder_id
  );
$$;

revoke execute on function es_cuidador_de(uuid) from public, anon;
revoke execute on function puede_editar_de(uuid) from public, anon;
grant execute on function es_cuidador_de(uuid) to authenticated;
grant execute on function puede_editar_de(uuid) to authenticated;

-- 3 · medicamentos ---------------------------------------------------------------

drop policy if exists medicamentos_select_cuidador on medicamentos;
drop policy if exists medicamentos_insert_cuidador on medicamentos;

create policy medicamentos_select_cuidador on medicamentos
  for select using (es_cuidador_de(usuario_id));
create policy medicamentos_insert_cuidador on medicamentos
  for insert with check (puede_editar_de(usuario_id));
create policy medicamentos_update_cuidador on medicamentos
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy medicamentos_delete_cuidador on medicamentos
  for delete using (puede_editar_de(usuario_id));

-- 4 · medicamentos_tomas -----------------------------------------------------------

drop policy if exists medicamentos_tomas_select_cuidador on medicamentos_tomas;
drop policy if exists medicamentos_tomas_insert_cuidador on medicamentos_tomas;
drop policy if exists medicamentos_tomas_update_cuidador on medicamentos_tomas;

create policy medicamentos_tomas_select_cuidador on medicamentos_tomas
  for select using (es_cuidador_de(usuario_id));
create policy medicamentos_tomas_insert_cuidador on medicamentos_tomas
  for insert with check (puede_editar_de(usuario_id));
create policy medicamentos_tomas_update_cuidador on medicamentos_tomas
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy medicamentos_tomas_delete_cuidador on medicamentos_tomas
  for delete using (puede_editar_de(usuario_id));

-- 5 · turnos -------------------------------------------------------------------------

create policy turnos_select_cuidador on turnos
  for select using (es_cuidador_de(usuario_id));
create policy turnos_insert_cuidador on turnos
  for insert with check (puede_editar_de(usuario_id));
create policy turnos_update_cuidador on turnos
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy turnos_delete_cuidador on turnos
  for delete using (puede_editar_de(usuario_id));

-- 6 · inventario_pastillas --------------------------------------------------------------
-- 014 solo daba SELECT al cuidador y descontaba stock por RPC. Para "Mis
-- pastillas" de la persona activa (contar, cargar stock al crear un
-- medicamento) el cuidador 'editar' necesita escritura directa.

drop policy if exists inventario_pastillas_select_cuidador on inventario_pastillas;

create policy inventario_pastillas_select_cuidador on inventario_pastillas
  for select using (es_cuidador_de(usuario_id));
create policy inventario_pastillas_insert_cuidador on inventario_pastillas
  for insert with check (puede_editar_de(usuario_id));
create policy inventario_pastillas_update_cuidador on inventario_pastillas
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy inventario_pastillas_delete_cuidador on inventario_pastillas
  for delete using (puede_editar_de(usuario_id));

-- Misma firma y shape que 014; ahora el cuidador necesita rol 'editar'.
create or replace function ajustar_stock_pastillas(p_inventario_id uuid, p_direccion int)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock int;
begin
  if auth.uid() is null or p_direccion not in (-1, 1) then
    return null;
  end if;

  update inventario_pastillas ip
  set stock = greatest(0, ip.stock + p_direccion * ip.pastillas_por_toma),
      updated_at = now()
  where ip.id = p_inventario_id
    and (ip.usuario_id = auth.uid() or puede_editar_de(ip.usuario_id))
  returning ip.stock into v_stock;

  return v_stock;
end;
$$;

revoke execute on function ajustar_stock_pastillas(uuid, int) from public, anon;
grant execute on function ajustar_stock_pastillas(uuid, int) to authenticated;

-- 7 · estudios (+ storage) ------------------------------------------------------------------

create policy estudios_select_cuidador on estudios
  for select using (es_cuidador_de(usuario_id));
create policy estudios_insert_cuidador on estudios
  for insert with check (puede_editar_de(usuario_id));
create policy estudios_delete_cuidador on estudios
  for delete using (puede_editar_de(usuario_id));

-- Path "{elder_id}/{archivo}". El primer segmento se valida como uuid ANTES
-- de castearlo: un path con otro formato no debe tirar error, solo no matchear.
create policy estudios_storage_select_cuidador on storage.objects
  for select using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.es_cuidador_de(((storage.foldername(name))[1])::uuid)
  );
create policy estudios_storage_insert_cuidador on storage.objects
  for insert with check (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.puede_editar_de(((storage.foldername(name))[1])::uuid)
  );
create policy estudios_storage_delete_cuidador on storage.objects
  for delete using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.puede_editar_de(((storage.foldername(name))[1])::uuid)
  );

-- 8 · perfiles ----------------------------------------------------------------------------------
-- Reabre lo que 008 había cerrado a propósito (perfil solo vía RPC): ahora
-- el cuidador ve la salud completa de la persona (Mi Salud / Resumen) — es
-- el producto de Familia, con un vínculo aceptado por la persona o creado
-- por el propio cuidador. Sin policy de INSERT: un perfil ajeno nace solo
-- desde el cliente admin (perfil gestionado) o en el login de su dueño.

create policy perfiles_select_cuidador on perfiles
  for select using (es_cuidador_de(id));
create policy perfiles_update_cuidador on perfiles
  for update using (puede_editar_de(id)) with check (puede_editar_de(id));

-- RLS es de fila: un trigger restringe QUÉ columnas puede cambiar alguien que
-- no es el dueño (nombre, color y datos de salud sí; estado de la cuenta no).
-- service_role (auth.uid() null) no se restringe.
create or replace function perfiles_proteger_columnas_ajenas()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.id then
    if new.id is distinct from old.id
      or new.uso_app is distinct from old.uso_app
      or new.onboarding_completado_at is distinct from old.onboarding_completado_at
      or new.avatar_url is distinct from old.avatar_url
      or new.created_at is distinct from old.created_at
    then
      raise exception 'columna_no_editable_por_cuidador';
    end if;
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger_columnas_ajenas
  before update on perfiles
  for each row execute function perfiles_proteger_columnas_ajenas();

-- 9 · preferencias_avisos ---------------------------------------------------------------------------

create policy preferencias_avisos_select_cuidador on preferencias_avisos
  for select using (es_cuidador_de(usuario_id));
create policy preferencias_avisos_insert_cuidador on preferencias_avisos
  for insert with check (puede_editar_de(usuario_id));
create policy preferencias_avisos_update_cuidador on preferencias_avisos
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));

-- 10 · codigos_acceso ------------------------------------------------------------------------------
-- Un código de acceso abre una sesión COMO esa persona (con escritura total
-- sobre sus datos), así que generarlo exige rol 'editar'. Un 'ver' no puede.

drop policy if exists codigos_acceso_insert_cuidador on codigos_acceso;

create policy codigos_acceso_insert_cuidador on codigos_acceso
  for insert to authenticated
  with check (
    codigos_acceso.cuidador_id = auth.uid()
    and puede_editar_de(codigos_acceso.elder_id)
  );

-- 11 · RPCs ------------------------------------------------------------------------------------------

-- Personas que cuido (vínculo aceptado), con nombre/color/rol/relación y si
-- la cuenta ya inició sesión alguna vez (= "usa su celular"). Expone de
-- auth.users solo ese booleano.
create or replace function listar_familia()
returns table (
  vinculo_id uuid,
  elder_id uuid,
  nombre text,
  color text,
  rol text,
  relacion text,
  conectado boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    vc.id as vinculo_id,
    vc.elder_id as elder_id,
    p.nombre as nombre,
    p.color as color,
    vc.rol as rol,
    vc.relacion as relacion,
    (u.last_sign_in_at is not null) as conectado
  from vinculos_cuidador vc
  left join perfiles p on p.id = vc.elder_id
  left join auth.users u on u.id = vc.elder_id
  where vc.cuidador_id = auth.uid()
    and vc.estado = 'aceptado'
    and vc.elder_id is not null
    and vc.elder_id <> vc.cuidador_id
  order by vc.aceptado_at nulls last, vc.created_at;
$$;

-- Quiénes me cuidan (vínculo aceptado hacia mí) con su nombre — la persona
-- cuidada no tiene policy sobre el perfil de sus cuidadores.
create or replace function listar_mis_cuidadores()
returns table (
  vinculo_id uuid,
  cuidador_id uuid,
  nombre text,
  rol text,
  relacion text,
  aceptado_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    vc.id as vinculo_id,
    vc.cuidador_id as cuidador_id,
    p.nombre as nombre,
    vc.rol as rol,
    vc.relacion as relacion,
    vc.aceptado_at as aceptado_at
  from vinculos_cuidador vc
  left join perfiles p on p.id = vc.cuidador_id
  where vc.elder_id = auth.uid()
    and vc.estado = 'aceptado'
    and vc.cuidador_id is not null
    and vc.cuidador_id <> vc.elder_id
  order by vc.aceptado_at nulls last, vc.created_at;
$$;

-- La persona cuidada (dueña de la cuenta) cambia el permiso de uno de sus
-- cuidadores. Hace falta RPC: vinculos_all_elder (008) bloquea a propósito
-- todo UPDATE directo sobre una fila aceptada.
create or replace function cambiar_rol_cuidador(p_vinculo_id uuid, p_rol text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  if p_rol is null or p_rol not in ('editar', 'ver') then
    raise exception 'rol_invalido';
  end if;

  update vinculos_cuidador vc
  set rol = p_rol
  where vc.id = p_vinculo_id
    and vc.elder_id = auth.uid()
    and vc.estado = 'aceptado';

  return found;
end;
$$;

-- El cuidador deja de cuidar a alguien (revoca su propio vínculo aceptado).
-- vinculos_update_cuidador (010) solo permite tocar filas sin elder.
create or replace function dejar_de_cuidar(p_vinculo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  update vinculos_cuidador vc
  set estado = 'revocado'
  where vc.id = p_vinculo_id
    and vc.cuidador_id = auth.uid()
    and vc.estado = 'aceptado';

  return found;
end;
$$;

revoke execute on function listar_familia() from public, anon;
revoke execute on function listar_mis_cuidadores() from public, anon;
revoke execute on function cambiar_rol_cuidador(uuid, text) from public, anon;
revoke execute on function dejar_de_cuidar(uuid) from public, anon;
grant execute on function listar_familia() to authenticated;
grant execute on function listar_mis_cuidadores() to authenticated;
grant execute on function cambiar_rol_cuidador(uuid, text) to authenticated;
grant execute on function dejar_de_cuidar(uuid) to authenticated;
