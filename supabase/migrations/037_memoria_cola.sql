-- Vita — cola de segundo plano de la memoria y resumen incremental (etapa M5).
-- ESCRITA pero NO aplicada: aplicar a mano con psql (después de la 035) y registrar en supabase_migrations.schema_migrations.
--
-- NO aplicar tal cual: el placeholder `<CRON_SECRET_VALUE>` se reemplaza a mano, solo en el archivo local, por el
-- valor REAL de CRON_SECRET (el mismo que tiene Netlify) justo antes de aplicar. Nunca commitear el valor real.
-- Requisitos previos: 035 aplicada, la ruta /api/cron/memoria deployada, y CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY /
-- ANTHROPIC_API_KEY cargadas en Netlify. Rollback del job: select cron.unschedule('memoria-cola');
--
-- Cuatro funciones SECURITY DEFINER que solo ejecuta service_role (el trabajador de segundo plano; `tareas_memoria`
-- no tiene policies a propósito). Ninguna recibe texto: solo ids, versiones y el resumen ya producido.
--   encolar_tarea_memoria     idempotente: el índice único parcial deja UNA tarea pendiente por (persona, tipo).
--   tomar_tarea_memoria       FOR UPDATE SKIP LOCKED; reserva 2 min; recupera reservas vencidas; máx. 5 intentos.
--   completar_tarea_memoria   hecha / reintento / fallida.
--   guardar_resumen           escribe SOLO si la versión actual es la esperada (control optimista) y sube la versión.
-- Convención del repo: en funciones con `returns table`, las columnas de salida llevan prefijo `o_` y toda
-- referencia a una columna va calificada con alias.

begin;

-- ---------------------------------------------------------------------------
-- encolar_tarea_memoria
-- ---------------------------------------------------------------------------
create or replace function encolar_tarea_memoria(p_usuario uuid, p_tipo text, p_version_esperada int)
returns table (o_id uuid, o_nueva boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Si ya hay una en curso con la reserva vigente, no se encola otra: esa va a mover la versión del resumen.
  select t.id into v_id from tareas_memoria t
   where t.usuario_id = p_usuario and t.tipo = p_tipo and t.estado = 'en_curso' and t.reservada_hasta >= now()
   limit 1;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  insert into tareas_memoria as t (usuario_id, tipo, version_esperada)
  values (p_usuario, p_tipo, p_version_esperada)
  on conflict (usuario_id, tipo) where estado = 'pendiente' do nothing
  returning t.id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  -- Ya había una pendiente (otro mensaje la encoló antes): se reutiliza, no se duplica.
  select t.id into v_id from tareas_memoria t
   where t.usuario_id = p_usuario and t.tipo = p_tipo and t.estado = 'pendiente'
   limit 1;
  return query select v_id, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- tomar_tarea_memoria
-- ---------------------------------------------------------------------------
-- Toma la tarea más vieja que se pueda trabajar: 'pendiente', o 'en_curso' con la reserva vencida (el trabajador
-- anterior murió o se colgó). No toma una tarea de una persona que ya tiene otra en curso con reserva vigente
-- (dos trabajadores sobre la misma persona serían trabajo tirado). A la quinta reserva sin éxito la tarea pasa a
-- 'fallida'. Devuelve cero filas si no hay nada para hacer.
create or replace function tomar_tarea_memoria()
returns table (o_id uuid, o_usuario_id uuid, o_tipo text, o_version_esperada int, o_intentos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_intentos int;
  v_ronda int;
  v_usuario uuid;
  v_tipo text;
  v_version int;
begin
  for v_ronda in 1..10 loop
    select t.id, t.intentos into v_id, v_intentos
      from tareas_memoria t
     where (t.estado = 'pendiente' or (t.estado = 'en_curso' and t.reservada_hasta < now()))
       and not exists (
         select 1 from tareas_memoria o
          where o.usuario_id = t.usuario_id and o.id <> t.id
            and o.estado = 'en_curso' and o.reservada_hasta >= now()
       )
     order by t.created_at, t.id
     limit 1
       for update of t skip locked;

    if v_id is null then
      return;
    end if;

    if v_intentos >= 5 then
      update tareas_memoria t
         set estado = 'fallida', reservada_hasta = null, error = coalesce(t.error, 'intentos agotados')
       where t.id = v_id;
      v_id := null;
      continue;
    end if;

    update tareas_memoria t
       set estado = 'en_curso', reservada_hasta = now() + interval '2 minutes', intentos = t.intentos + 1
     where t.id = v_id
    returning t.usuario_id, t.tipo, t.version_esperada, t.intentos
      into v_usuario, v_tipo, v_version, v_intentos;
    return query select v_id, v_usuario, v_tipo, v_version, v_intentos;
    return;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- completar_tarea_memoria
-- ---------------------------------------------------------------------------
-- ok = hecha. No ok: vuelve a 'pendiente' para reintentar (mientras queden intentos); si ya hay otra pendiente para
-- la misma persona y tipo (el índice único lo impide), esta queda 'fallida' como reemplazada: la nueva hará el trabajo.
-- Solo actúa sobre una tarea 'en_curso' (una vencida y retomada por otro no se pisa). Devuelve si encontró la fila.
create or replace function completar_tarea_memoria(p_id uuid, p_ok boolean, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intentos int;
begin
  if p_ok then
    update tareas_memoria t set estado = 'hecha', reservada_hasta = null, error = null
     where t.id = p_id and t.estado = 'en_curso';
    return found;
  end if;

  select t.intentos into v_intentos from tareas_memoria t where t.id = p_id and t.estado = 'en_curso' for update;
  if not found then
    return false;
  end if;

  if v_intentos >= 5 then
    update tareas_memoria t set estado = 'fallida', reservada_hasta = null, error = left(coalesce(p_error, 'error'), 200)
     where t.id = p_id;
    return true;
  end if;

  begin
    update tareas_memoria t set estado = 'pendiente', reservada_hasta = null, error = left(coalesce(p_error, 'error'), 200)
     where t.id = p_id;
  exception when unique_violation then
    update tareas_memoria t set estado = 'fallida', reservada_hasta = null, error = 'reemplazada por otra pendiente'
     where t.id = p_id;
  end;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- guardar_resumen
-- ---------------------------------------------------------------------------
-- Escribe el resumen solo si la versión actual es la esperada (0 = todavía no hay fila). Cualquier otro caso
-- (otro resumen ya ganó, o el resumen se borró) devuelve o_guardado = false y el trabajador descarta el suyo.
-- Tampoco escribe si el último mensaje cubierto ya no existe (la persona borró el historial mientras se resumía).
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
         updated_at = now()
   where r.usuario_id = p_usuario and r.version = p_version_esperada
  returning r.version into v_version;
  if found then
    return query select true, v_version;
    return;
  end if;

  if p_version_esperada = 0 then
    insert into resumen_conversacion as r (usuario_id, resumen, pendientes, cubre_hasta_mensaje_id, cubre_hasta_created_at, version)
    values (p_usuario, p_resumen, coalesce(p_pendientes, '[]'::jsonb), p_cubre_hasta_id, p_cubre_hasta_created_at, 1)
    on conflict (usuario_id) do nothing
    returning r.version into v_version;
    if found then
      return query select true, v_version;
      return;
    end if;
  end if;

  return query select false, null::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: solo service_role
-- ---------------------------------------------------------------------------
revoke all on function encolar_tarea_memoria(uuid, text, int) from public, anon, authenticated;
revoke all on function tomar_tarea_memoria() from public, anon, authenticated;
revoke all on function completar_tarea_memoria(uuid, boolean, text) from public, anon, authenticated;
revoke all on function guardar_resumen(uuid, text, jsonb, uuid, timestamptz, int) from public, anon, authenticated;
grant execute on function encolar_tarea_memoria(uuid, text, int) to service_role;
grant execute on function tomar_tarea_memoria() to service_role;
grant execute on function completar_tarea_memoria(uuid, boolean, text) to service_role;
grant execute on function guardar_resumen(uuid, text, jsonb, uuid, timestamptz, int) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Scheduler: Supabase Cron (pg_cron + pg_net), cada minuto, llama a la ruta del trabajador.
-- Es el respaldo de `after()` en el chat: si el disparo inmediato falla, la cola igual se vacía.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'memoria-cola') then
    perform cron.unschedule('memoria-cola');
  end if;
end;
$$;

select cron.schedule(
  'memoria-cola',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://vitappweb.netlify.app/api/cron/memoria',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{}'::jsonb
  );
  $$
);
