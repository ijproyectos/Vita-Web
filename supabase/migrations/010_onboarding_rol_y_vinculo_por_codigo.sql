-- Vitapp — Onboarding "¿para quién vas a usar la app?" + vínculo cuidador
-- iniciado por el cuidador (QR / código de 6 dígitos) + escritura limitada
-- del cuidador sobre medicamentos del elder (crear + marcar tomada).
--
-- Tres piezas, cada una aditiva sobre 008_cuidadores.sql, ninguna reemplaza
-- una policy existente:
--
-- 1. perfiles.uso_app — respuesta al paso nuevo de onboarding, se pregunta
--    una sola vez (gateado por esta misma columna, no por
--    onboarding_completado_at, que sigue siendo el gate de /app/*).
--
-- 2. vinculos_cuidador ahora soporta DOS direcciones:
--    (a) la que ya existía: el elder invita (elder_id set desde el
--        insert, cuidador_id null hasta el claim, token+link).
--    (b) nueva: el cuidador inicia el vínculo ANTES de que el elder
--        tenga nada cargado (cuidador_id set desde el insert, elder_id
--        null hasta el claim, codigo de 6 dígitos + QR sobre el mismo
--        token). Por eso elder_id deja de ser NOT NULL — es simétrico a
--        cómo cuidador_id ya era nullable en la dirección (a).
--    reclamar_invitacion_cuidador() (dirección a) ahora exige
--    elder_id IS NOT NULL explícito, para no confundirse con una fila
--    de la dirección (b). reclamar_vinculo_como_elder() (nueva, RPC
--    security definer simétrica) es la contraparte para la dirección
--    (b): exige elder_id IS NULL, busca por `codigo` en vez de `token`,
--    sin chequeo de email (el código no está atado a una dirección
--    puntual) — la mitigación de fuerza bruta es la ventana corta de
--    expira_at que pone la aplicación al generarlo (~30 min, no los 7
--    días del link), no un rate-limit (no existe esa infraestructura en
--    este proyecto; documentado como límite conocido, no como olvido).
--
-- 3. Escritura del cuidador — confirmado explícitamente con el usuario
--    que va más allá de "marcar tomada": el cuidador puede CREAR
--    medicamentos nuevos para el elder vinculado (coincide con el
--    diseño, donde el perfil de Elsa ya tiene medicamentos antes de
--    vincular su celular). Acotado a INSERT en `medicamentos` (no
--    update/delete de medicamentos existentes — eso queda fuera de esta
--    decisión, no se asumió) + INSERT/UPDATE en `medicamentos_tomas`
--    (marcar tomada, que es upsert por (medicamento_id, fecha)).

alter table perfiles
  add column uso_app text check (uso_app in ('yo', 'cuido', 'ambos'));

alter table vinculos_cuidador
  alter column elder_id drop not null,
  add column codigo text;

create unique index idx_vinculo_codigo_pendiente on vinculos_cuidador (codigo)
  where estado = 'pendiente' and codigo is not null;

-- RLS: vinculos_cuidador, dirección (b) — el cuidador inicia -------------

-- Crea la fila placeholder (elder_id null, codigo+QR para compartir).
create policy vinculos_insert_cuidador on vinculos_cuidador
  for insert with check (cuidador_id = auth.uid() and elder_id is null);

-- Reemitir código / cancelar ANTES del claim — a propósito acotado a
-- "elder_id is null": una vez reclamada, la fila deja de ser modificable
-- por acá (quién puede revocar un vínculo ya aceptado de esta dirección
-- queda fuera de esta decisión, no se asumió). `estado <> 'aceptado'` en
-- el check bloquea explícitamente que el propio cuidador se autoacepte
-- el vínculo por un update directo — esa transición solo puede pasar
-- dentro de reclamar_vinculo_como_elder(), que corre security definer y
-- por lo tanto ignora esta policy (mismo criterio que vinculos_all_elder
-- en 008_cuidadores.sql para la dirección elder→cuidador).
create policy vinculos_update_cuidador on vinculos_cuidador
  for update using (cuidador_id = auth.uid() and elder_id is null)
  with check (cuidador_id = auth.uid() and elder_id is null and estado <> 'aceptado');

-- RLS: escritura acotada del cuidador sobre datos del elder --------------
-- Aditivas sobre medicamentos_all_self / medicamentos_tomas_all_self
-- (002_rls_policies.sql) y sobre las _select_cuidador de 008 — ninguna
-- se toca, Postgres evalúa todas las del mismo comando con OR.

create policy medicamentos_insert_cuidador on medicamentos
  for insert with check (usuario_id in (
    select elder_id from vinculos_cuidador
    where cuidador_id = auth.uid() and estado = 'aceptado' and elder_id is not null
  ));

create policy medicamentos_tomas_insert_cuidador on medicamentos_tomas
  for insert with check (usuario_id in (
    select elder_id from vinculos_cuidador
    where cuidador_id = auth.uid() and estado = 'aceptado' and elder_id is not null
  ));

create policy medicamentos_tomas_update_cuidador on medicamentos_tomas
  for update using (usuario_id in (
    select elder_id from vinculos_cuidador
    where cuidador_id = auth.uid() and estado = 'aceptado' and elder_id is not null
  )) with check (usuario_id in (
    select elder_id from vinculos_cuidador
    where cuidador_id = auth.uid() and estado = 'aceptado' and elder_id is not null
  ));

-- RPCs ----------------------------------------------------------------------

-- Dirección (a), existente — ahora exige elder_id explícito para no
-- confundir una fila de la dirección (b) con una invitación por link.
create or replace function reclamar_invitacion_cuidador(p_token text)
returns table (elder_id uuid, nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
  v_email text;
begin
  select * into v_vinculo
  from vinculos_cuidador
  where token = p_token and estado = 'pendiente' and elder_id is not null
  for update;

  if not found then
    raise exception 'invitacion_no_encontrada';
  end if;

  if v_vinculo.expira_at < now() then
    raise exception 'invitacion_expirada';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if v_email is null or lower(v_email) <> lower(v_vinculo.email_invitado) then
    raise exception 'invitacion_no_corresponde_a_esta_cuenta';
  end if;

  update vinculos_cuidador
  set cuidador_id = auth.uid(), estado = 'aceptado', aceptado_at = now()
  where id = v_vinculo.id;

  return query
  select p.id as elder_id, p.nombre as nombre
  from perfiles p
  where p.id = v_vinculo.elder_id;
end;
$$;

-- Dirección (b), nueva — el elder reclama un vínculo que el cuidador
-- inició, buscando por `codigo` (no `token`). Nunca recibe elder_id como
-- parámetro, siempre usa auth.uid() internamente — mismo criterio que la
-- RPC de arriba, por la misma razón (no se puede reclamar en nombre de
-- otra cuenta).
create or replace function reclamar_vinculo_como_elder(p_codigo text)
returns table (cuidador_id uuid, nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
begin
  select * into v_vinculo
  from vinculos_cuidador
  where codigo = p_codigo and estado = 'pendiente' and elder_id is null
  for update;

  if not found then
    raise exception 'codigo_no_encontrado';
  end if;

  if v_vinculo.expira_at < now() then
    raise exception 'codigo_expirado';
  end if;

  if exists (
    select 1 from vinculos_cuidador
    where elder_id = auth.uid() and cuidador_id = v_vinculo.cuidador_id and estado = 'aceptado'
  ) then
    raise exception 'ya_vinculado';
  end if;

  update vinculos_cuidador
  set elder_id = auth.uid(), estado = 'aceptado', aceptado_at = now()
  where id = v_vinculo.id;

  return query
  select p.id as cuidador_id, p.nombre as nombre
  from perfiles p
  where p.id = v_vinculo.cuidador_id;
end;
$$;

revoke execute on function reclamar_vinculo_como_elder(text) from public, anon;
grant execute on function reclamar_vinculo_como_elder(text) to authenticated;
