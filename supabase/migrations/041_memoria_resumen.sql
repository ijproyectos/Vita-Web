-- Vita — memoria persistente, fase 3: resumen incremental de la conversación.
-- ESCRITA pero NO aplicada: aplicar a mano con `psql -1` (después de 038, 039 y 040) y registrar en
-- supabase_migrations.schema_migrations. Idempotente: se puede volver a correr.
--
-- Una fila por persona en `resumen_conversacion` guarda el resumen vigente, el cursor de lo ya cubierto y el estado de la
-- cola de trabajo (una marca "pendiente", una reserva vencible y un contador de intentos): la cola es la propia fila, no
-- hace falta otra tabla. Escribe SOLO service_role o las funciones de abajo; el dueño únicamente la lee (RLS owner-only,
-- sin policies de cuidador: ni la persona cuidada ni otros cuidadores ven el resumen).
--
-- Funciones (convención del repo: en las que devuelven tabla, las columnas de salida llevan prefijo `o_` y toda referencia
-- a una columna va calificada con alias):
--   marcar_resumen_pendiente   authenticated, SECURITY DEFINER (auth.uid()): marca "hay que resumir" si se juntaron
--                              suficientes mensajes nuevos. La llama el chat con el cliente de sesión.
--   invalidar_resumen          authenticated, SECURITY DEFINER (auth.uid()): vacía el resumen y sube la versión, así un
--                              trabajador que lo estaba recalculando no puede pisar el borrado.
--   tomar_resumenes_pendientes service_role: reserva por 2 minutos hasta N filas pendientes (FOR UPDATE SKIP LOCKED).
--   mensajes_para_resumen      service_role: mensajes posteriores al cursor, los más viejos primero.
--   guardar_resumen            service_role: escribe solo si la versión es la esperada (control optimista).
--   completar_resumen          service_role: cierra o reintenta (con espera) una tarea; a los 5 intentos la abandona.
-- Además se reemplazan (create or replace, sin tocar la 040) olvidar_memoria, olvidar_todo_memoria y
-- borrar_recuerdos_de_sesiones_hasta para que también invaliden el resumen, y se agenda el cron `memoria-resumen`.
-- Sin esta migración la app degrada: no hay resumen y el chat funciona igual.

-- ---------------------------------------------------------------------------
-- resumen_conversacion
-- ---------------------------------------------------------------------------
create table if not exists resumen_conversacion (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  resumen text not null default '',
  pendientes jsonb not null default '[]'::jsonb,  -- asuntos abiertos de la charla (lista corta de textos)
  cubre_hasta_mensaje_id uuid,                    -- último mensaje cubierto (sin FK: puede borrarse)
  cubre_hasta_created_at timestamptz,             -- su created_at, para el cursor (created_at, id)
  version int not null default 1,                 -- control optimista: se reemplaza solo si no cambió
  pendiente_desde timestamptz,                    -- cola: hay mensajes nuevos sin resumir desde este instante
  reservada_hasta timestamptz,                    -- cola: reserva del trabajador; también "no antes de" tras un fallo
  intentos int not null default 0 check (intentos >= 0),
  error text,                                     -- último código de error (corto; nunca texto de mensajes)
  updated_at timestamptz not null default now()
);

create index if not exists idx_resumen_conversacion_cola on resumen_conversacion (pendiente_desde) where pendiente_desde is not null;

alter table resumen_conversacion enable row level security;

-- Solo lectura para el dueño. Sin policies de escritura a propósito: se escribe por las funciones de abajo.
drop policy if exists resumen_conversacion_select_self on resumen_conversacion;
create policy resumen_conversacion_select_self on resumen_conversacion for select using (usuario_id = auth.uid());

revoke all on table resumen_conversacion from anon;
revoke insert, update, delete on table resumen_conversacion from authenticated;

-- ---------------------------------------------------------------------------
-- invalidar_resumen
-- ---------------------------------------------------------------------------
-- Deja el resumen vacío (el cursor se conserva: lo ya olvidado no vuelve a resumirse) y sube la versión. Crea la fila si
-- no existe. Corta también la cola de la persona.
create or replace function invalidar_resumen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  insert into resumen_conversacion as r (usuario_id, resumen, pendientes, version)
  values (v_uid, '', '[]'::jsonb, 1)
  on conflict (usuario_id) do update
    set resumen = '',
        pendientes = '[]'::jsonb,
        version = r.version + 1,
        pendiente_desde = null,
        reservada_hasta = null,
        intentos = 0,
        error = null,
        updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- marcar_resumen_pendiente
-- ---------------------------------------------------------------------------
-- Si desde el último mensaje cubierto hay al menos `p_minimo` mensajes (sin los excluidos de la memoria), marca la fila
-- como pendiente. Idempotente: una marca vieja se conserva (el orden de la cola es por antigüedad). Devuelve si marcó.
-- Con la memoria apagada no marca nada.
create or replace function marcar_resumen_pendiente(p_minimo int default 16)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minimo int := greatest(4, least(coalesce(p_minimo, 16), 200));
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_nuevos int;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if not exists (select 1 from perfiles p where p.id = v_uid and p.memoria_activa) then
    return false;
  end if;

  select r.cubre_hasta_created_at, r.cubre_hasta_mensaje_id
    into v_cursor_at, v_cursor_id
    from resumen_conversacion r
   where r.usuario_id = v_uid;

  select count(*) into v_nuevos
    from (
      select 1
        from mensajes_chat m
       where m.usuario_id = v_uid
         and not m.excluido_memoria
         and (v_cursor_at is null or (m.created_at, m.id) > (v_cursor_at, v_cursor_id))
       limit v_minimo
    ) s;

  if v_nuevos < v_minimo then
    return false;
  end if;

  insert into resumen_conversacion as r (usuario_id, pendiente_desde)
  values (v_uid, now())
  on conflict (usuario_id) do update
    set pendiente_desde = coalesce(r.pendiente_desde, now()),
        -- Una tarea abandonada (5 intentos) vuelve a intentarse cuando llegan mensajes nuevos.
        intentos = case when r.intentos >= 5 and (r.reservada_hasta is null or r.reservada_hasta < now()) then 0 else r.intentos end;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- tomar_resumenes_pendientes
-- ---------------------------------------------------------------------------
create or replace function tomar_resumenes_pendientes(p_max int default 3)
returns table (o_usuario_id uuid, o_version int, o_intentos int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with elegidos as (
    select r.usuario_id
      from resumen_conversacion r
     where r.pendiente_desde is not null
       and (r.reservada_hasta is null or r.reservada_hasta < now())
       and r.intentos < 5
     order by r.pendiente_desde, r.usuario_id
     limit greatest(1, least(coalesce(p_max, 3), 10))
       for update of r skip locked
  )
  update resumen_conversacion u
     set reservada_hasta = now() + interval '2 minutes',
         intentos = u.intentos + 1
    from elegidos e
   where u.usuario_id = e.usuario_id
  returning u.usuario_id, u.version, u.intentos;
end;
$$;

-- ---------------------------------------------------------------------------
-- mensajes_para_resumen
-- ---------------------------------------------------------------------------
-- Mensajes posteriores al cursor, los más viejos primero, con cada contenido recortado. Incluye los excluidos de la
-- memoria SOLO para que el cursor avance sobre ellos: el trabajador los descarta antes de armar el prompt.
create or replace function mensajes_para_resumen(p_usuario uuid, p_limite int default 200)
returns table (o_id uuid, o_role text, o_contenido text, o_created_at timestamptz, o_excluido boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cursor_at timestamptz;
  v_cursor_id uuid;
begin
  select r.cubre_hasta_created_at, r.cubre_hasta_mensaje_id
    into v_cursor_at, v_cursor_id
    from resumen_conversacion r
   where r.usuario_id = p_usuario;

  return query
  select m.id, m.role::text, case when m.excluido_memoria then '' else left(coalesce(m.contenido, ''), 1200) end,
         m.created_at, m.excluido_memoria
    from mensajes_chat m
   where m.usuario_id = p_usuario
     and (v_cursor_at is null or (m.created_at, m.id) > (v_cursor_at, v_cursor_id))
   order by m.created_at, m.id
   limit greatest(1, least(coalesce(p_limite, 200), 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- guardar_resumen
-- ---------------------------------------------------------------------------
-- Escribe solo si la versión actual es la esperada y la memoria sigue activa. Si el resumen se invalidó mientras se
-- calculaba (la versión cambió) devuelve o_guardado = false y el trabajador descarta el suyo. Tampoco escribe si el último
-- mensaje cubierto ya no existe (la persona borró el historial mientras se resumía).
create or replace function guardar_resumen(
  p_usuario uuid,
  p_resumen text,
  p_pendientes jsonb,
  p_cubre_hasta_id uuid,
  p_cubre_hasta_created_at timestamptz,
  p_version_esperada int
)
returns table (o_guardado boolean, o_version int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
begin
  if not exists (select 1 from perfiles p where p.id = p_usuario and p.memoria_activa) then
    return query select false, null::int;
    return;
  end if;
  if p_cubre_hasta_id is not null and not exists (
    select 1 from mensajes_chat m where m.id = p_cubre_hasta_id and m.usuario_id = p_usuario
  ) then
    return query select false, null::int;
    return;
  end if;

  update resumen_conversacion r
     set resumen = p_resumen,
         pendientes = coalesce(p_pendientes, '[]'::jsonb),
         cubre_hasta_mensaje_id = p_cubre_hasta_id,
         cubre_hasta_created_at = p_cubre_hasta_created_at,
         version = r.version + 1,
         pendiente_desde = null,
         reservada_hasta = null,
         intentos = 0,
         error = null,
         updated_at = now()
   where r.usuario_id = p_usuario and r.version = p_version_esperada
  returning r.version into v_version;
  if found then
    return query select true, v_version;
  else
    return query select false, null::int;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- completar_resumen
-- ---------------------------------------------------------------------------
-- ok = no queda nada pendiente (se resumió, no había nada para resumir o se salteó a propósito: memoria apagada, límite
-- diario). No ok: se reintenta en 10 minutos; a los 5 intentos se abandona (vuelve a marcarse con mensajes nuevos).
create or replace function completar_resumen(p_usuario uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ok then
    update resumen_conversacion r
       set pendiente_desde = null, reservada_hasta = null, intentos = 0, error = null
     where r.usuario_id = p_usuario;
    return;
  end if;

  update resumen_conversacion r
     set error = left(coalesce(p_error, 'error'), 200),
         pendiente_desde = case when r.intentos >= 5 then null else r.pendiente_desde end,
         reservada_hasta = case when r.intentos >= 5 then null else now() + interval '10 minutes' end
   where r.usuario_id = p_usuario;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacidad: las funciones de la 040, ahora también invalidan el resumen
-- ---------------------------------------------------------------------------
-- Cuerpos idénticos a los de la 040 salvo el `perform invalidar_resumen()`. Siguen siendo SECURITY INVOKER.
create or replace function olvidar_memoria(p_id uuid)
returns table (o_recuerdos int, o_mensajes int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cadena uuid[];
  v_origenes uuid[];
  v_recuerdos int := 0;
  v_mensajes int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if not exists (select 1 from memorias m where m.id = p_id and m.usuario_id = v_uid and m.estado <> 'borrado') then
    return query select 0, 0;
    return;
  end if;

  with recursive cadena as (
    select m.id, m.corrige_id, m.mensaje_origen_id from memorias m where m.id = p_id and m.usuario_id = v_uid
    union
    select a.id, a.corrige_id, a.mensaje_origen_id from memorias a join cadena c on a.id = c.corrige_id where a.usuario_id = v_uid
  )
  select array_agg(c.id), array_agg(c.mensaje_origen_id) filter (where c.mensaje_origen_id is not null)
    into v_cadena, v_origenes
    from cadena c;

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid and m.estado <> 'borrado' and m.id = any(v_cadena);
  get diagnostics v_recuerdos = row_count;

  update mensajes_chat y
     set excluido_memoria = true
   where y.usuario_id = v_uid
     and not y.excluido_memoria
     and (
       y.id = any(coalesce(v_origenes, '{}'))
       or (
         y.role = 'assistant'
         and exists (
           select 1
             from mensajes_chat o
            where o.usuario_id = v_uid
              and o.id = any(coalesce(v_origenes, '{}'))
              and o.sesion_id = y.sesion_id
              and y.created_at > o.created_at
              and not exists (
                select 1
                  from mensajes_chat n
                 where n.usuario_id = v_uid
                   and n.sesion_id = o.sesion_id
                   and n.role = 'user'
                   and n.created_at > o.created_at
                   and n.created_at < y.created_at
              )
         )
       )
     );
  get diagnostics v_mensajes = row_count;

  -- El resumen pudo haber incorporado lo que se acaba de olvidar: se vacía (vita lo arma de nuevo con lo que siga contando).
  if v_recuerdos > 0 or v_mensajes > 0 then
    perform invalidar_resumen();
  end if;

  return query select v_recuerdos, v_mensajes;
end;
$$;

create or replace function olvidar_todo_memoria()
returns table (o_recuerdos int, o_mensajes int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recuerdos int := 0;
  v_mensajes int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid and m.estado <> 'borrado';
  get diagnostics v_recuerdos = row_count;

  update mensajes_chat x
     set excluido_memoria = true
   where x.usuario_id = v_uid and not x.excluido_memoria;
  get diagnostics v_mensajes = row_count;

  perform invalidar_resumen();

  return query select v_recuerdos, v_mensajes;
end;
$$;

create or replace function borrar_recuerdos_de_sesiones_hasta(p_corte timestamptz)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid
     and m.estado <> 'borrado'
     and m.mensaje_origen_id in (
       select x.id
         from mensajes_chat x
         join sesiones_chat s on s.id = x.sesion_id
        where x.usuario_id = v_uid and s.usuario_id = v_uid and s.updated_at < p_corte
     );
  get diagnostics v_n = row_count;

  -- Si hay conversaciones que se van a borrar, el resumen pudo salir de ellas: se vacía.
  if exists (select 1 from sesiones_chat s where s.usuario_id = v_uid and s.updated_at < p_corte) then
    perform invalidar_resumen();
  end if;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function invalidar_resumen() from public, anon;
revoke execute on function marcar_resumen_pendiente(int) from public, anon;
revoke execute on function olvidar_memoria(uuid) from public, anon;
revoke execute on function olvidar_todo_memoria() from public, anon;
revoke execute on function borrar_recuerdos_de_sesiones_hasta(timestamptz) from public, anon;
grant execute on function invalidar_resumen() to authenticated;
grant execute on function marcar_resumen_pendiente(int) to authenticated;
grant execute on function olvidar_memoria(uuid) to authenticated;
grant execute on function olvidar_todo_memoria() to authenticated;
grant execute on function borrar_recuerdos_de_sesiones_hasta(timestamptz) to authenticated;

revoke all on function tomar_resumenes_pendientes(int) from public, anon, authenticated;
revoke all on function mensajes_para_resumen(uuid, int) from public, anon, authenticated;
revoke all on function guardar_resumen(uuid, text, jsonb, uuid, timestamptz, int) from public, anon, authenticated;
revoke all on function completar_resumen(uuid, boolean, text) from public, anon, authenticated;
grant execute on function tomar_resumenes_pendientes(int) to service_role;
grant execute on function mensajes_para_resumen(uuid, int) to service_role;
grant execute on function guardar_resumen(uuid, text, jsonb, uuid, timestamptz, int) to service_role;
grant execute on function completar_resumen(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: Supabase Cron (pg_cron + pg_net), cada 15 minutos, llama a /api/cron/memoria.
-- SIN secretos en este archivo: el comando se deriva del job `dosis-vencidas` (migración 018), que ya trae la URL y el
-- header `x-cron-secret` reales; solo se cambia el path. Si ese job no existe o pg_cron no está, no hace nada.
-- Rollback: select cron.unschedule('memoria-resumen');
-- ---------------------------------------------------------------------------
do $$
declare
  v_base text;
  v_comando text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'memoria-resumen: pg_cron no está instalado; no se agenda el job.';
    return;
  end if;

  execute 'select command from cron.job where jobname = $1' into v_base using 'dosis-vencidas';
  if v_base is null then
    raise notice 'memoria-resumen: no existe el job dosis-vencidas (migración 018); no se agenda el job.';
    return;
  end if;

  v_comando := replace(v_base, '/api/cron/dosis-vencidas', '/api/cron/memoria');
  if v_comando = v_base then
    raise notice 'memoria-resumen: el comando de dosis-vencidas no contiene la ruta esperada; no se agenda el job.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'memoria-resumen') then
    perform cron.unschedule('memoria-resumen');
  end if;
  perform cron.schedule('memoria-resumen', '*/15 * * * *', v_comando);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mensajes escritos con la memoria apagada: nacen excluidos de la memoria
-- ---------------------------------------------------------------------------
-- Si la persona apaga la memoria, lo que charle mientras tanto no debe entrar ni en buscar_memoria ni en un resumen
-- futuro cuando la vuelva a prender. Se resuelve en la base (no en cada llamador): todo mensaje nuevo de alguien con
-- `memoria_activa = false` se guarda con `excluido_memoria = true`.
create or replace function public.mensajes_chat_excluir_sin_memoria()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from perfiles p where p.id = new.usuario_id and p.memoria_activa is false) then
    new.excluido_memoria := true;
  end if;
  return new;
end;
$$;

drop trigger if exists mensajes_chat_excluir_sin_memoria on mensajes_chat;
create trigger mensajes_chat_excluir_sin_memoria
  before insert on mensajes_chat
  for each row execute function public.mensajes_chat_excluir_sin_memoria();
