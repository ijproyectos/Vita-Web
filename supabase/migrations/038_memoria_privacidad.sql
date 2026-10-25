-- Vita — control de la persona sobre la memoria: dejar de recordar, eliminar, borrar todo (etapa M6).
-- ESCRITA pero NO aplicada: aplicar a mano con psql (después de 035, 036 y 037) y registrar en supabase_migrations.schema_migrations.
--
-- Garantía de diseño: ninguna de estas operaciones puede dejar texto derivado vivo. Cada una corre en UNA transacción:
--   1) invalida el resumen (sin texto, `invalidado = true`, versión + 1: un trabajador que lo estaba recalculando con la
--      versión anterior ya no puede guardar su resultado), y recién después
--   2) deja los recuerdos 'borrado' sin texto y excluye o borra los mensajes de origen.
-- Mientras el resumen esté invalidado la app no manda ningún resumen a Claude; la tarea 'regenerar' (cola) lo rearma desde
-- cero con los mensajes no excluidos.
--
-- Funciones SECURITY INVOKER (la RLS owner-only de 035 sigue siendo la autoridad; además filtran por auth.uid()):
--   invalidar_resumen          deja el resumen vacío e invalidado (crea la fila si no existe, para frenar a un trabajador en vuelo).
--   olvidar_memoria            "dejar de recordar" (p_eliminar = false) o "eliminar" (true) un recuerdo y sus fuentes.
--   olvidar_todo_memoria       "borrar todo lo que vita recuerda": todos los recuerdos + resumen en blanco; los mensajes no se tocan.
--   borrar_mensajes_hasta      "Borrar historial" del chat: borra mensajes anteriores a un corte y los recuerdos que salieron de ellos.
-- Función SECURITY DEFINER solo para service_role (el trabajador):
--   guardar_resumen_regenerado escribe el resumen rearmado solo si la versión no cambió y sigue invalidado.
-- Se redefine encolar_tarea_memoria (de 037): 'regenerar' se encola siempre, aunque haya uno en curso, porque el que está en
-- curso va a perder la versión y su resultado se descarta.
-- Convención del repo: en funciones con `returns table`, las columnas de salida llevan prefijo `o_` y toda referencia a una
-- columna va calificada con alias.
-- Sin esta migración la app degrada: hace los mismos pasos desde el servidor y, en vez de invalidar, borra la fila del resumen.

begin;

alter table resumen_conversacion add column invalidado boolean not null default false;

-- ---------------------------------------------------------------------------
-- invalidar_resumen
-- ---------------------------------------------------------------------------
create or replace function invalidar_resumen()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  -- El cursor (cubre_hasta_*) se conserva: la ventana del chat sigue empezando donde empezaba.
  insert into resumen_conversacion as r (usuario_id, resumen, pendientes, version, invalidado)
  values (v_uid, '', '[]'::jsonb, 1, true)
  on conflict (usuario_id) do update
    set resumen = '', pendientes = '[]'::jsonb, invalidado = true, version = r.version + 1, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- olvidar_memoria
-- ---------------------------------------------------------------------------
-- Alcanza al recuerdo, a sus versiones anteriores (la cadena corrige_id: 'reemplazado' también guarda texto) y a las
-- fuentes: el mensaje de origen de cada uno + los que la persona confirmó (p_mensajes), más el resto de cada turno
-- (mismo pedido_id: la respuesta de vita repite el dato).
--   dejar de recordar: los mensajes quedan `excluido_memoria = true` (siguen visibles, no entran en búsqueda ni resúmenes).
--   eliminar: los mensajes se borran y también los recuerdos que salieron de ellos.
create or replace function olvidar_memoria(p_id uuid, p_mensajes uuid[] default '{}', p_eliminar boolean default false)
returns table (o_recuerdos int, o_mensajes int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cadena uuid[];
  v_origenes uuid[];
  v_fuentes uuid[];
  v_turnos uuid[];
  v_recuerdos int := 0;
  v_mensajes int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if coalesce(cardinality(p_mensajes), 0) > 20 then
    raise exception 'demasiados mensajes' using errcode = '22023';
  end if;

  if not exists (select 1 from memorias m where m.id = p_id and m.usuario_id = v_uid and m.estado <> 'borrado') then
    return query select 0, 0;
    return;
  end if;

  -- 1) El resumen primero.
  perform invalidar_resumen();

  -- 2) El recuerdo y sus versiones anteriores.
  with recursive cadena as (
    select m.id, m.corrige_id, m.mensaje_origen_id from memorias m where m.id = p_id and m.usuario_id = v_uid
    union
    select a.id, a.corrige_id, a.mensaje_origen_id from memorias a join cadena c on a.id = c.corrige_id where a.usuario_id = v_uid
  )
  select array_agg(c.id), array_agg(c.mensaje_origen_id) filter (where c.mensaje_origen_id is not null)
    into v_cadena, v_origenes
    from cadena c;

  -- 3) Fuentes: orígenes + confirmados (solo propios) + el resto de cada turno.
  select array_agg(distinct x.id) into v_fuentes
    from mensajes_chat x
   where x.usuario_id = v_uid
     and (x.id = any(coalesce(v_origenes, '{}') || coalesce(p_mensajes, '{}')));
  select array_agg(distinct y.pedido_id) into v_turnos
    from mensajes_chat y
   where y.usuario_id = v_uid and y.id = any(coalesce(v_fuentes, '{}')) and y.pedido_id is not null;
  select array_agg(distinct z.id) into v_fuentes
    from mensajes_chat z
   where z.usuario_id = v_uid
     and (z.id = any(coalesce(v_fuentes, '{}')) or z.pedido_id = any(coalesce(v_turnos, '{}')));

  -- 4) Recuerdos: sin texto, solo la marca. Al eliminar, también los que salieron de los mensajes que se borran.
  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid
     and m.estado <> 'borrado'
     and (m.id = any(v_cadena) or (p_eliminar and m.mensaje_origen_id = any(coalesce(v_fuentes, '{}'))));
  get diagnostics v_recuerdos = row_count;

  -- 5) Mensajes.
  if p_eliminar then
    delete from mensajes_chat x where x.usuario_id = v_uid and x.id = any(coalesce(v_fuentes, '{}'));
  else
    update mensajes_chat x set excluido_memoria = true
     where x.usuario_id = v_uid and x.id = any(coalesce(v_fuentes, '{}')) and not x.excluido_memoria;
  end if;
  get diagnostics v_mensajes = row_count;

  return query select v_recuerdos, v_mensajes;
end;
$$;

-- ---------------------------------------------------------------------------
-- olvidar_todo_memoria
-- ---------------------------------------------------------------------------
-- Todos los recuerdos quedan 'borrado' sin texto. Los mensajes NO se tocan (siguen en el historial). El resumen queda en
-- blanco y NO se regenera desde los mensajes (volvería a escribir lo que la persona acaba de borrar): su cursor pasa al
-- último mensaje, así que vita retoma desde acá y lo anterior solo existe como historial.
create or replace function olvidar_todo_memoria()
returns table (o_recuerdos int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ult_id uuid;
  v_ult_at timestamptz;
  v_n int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select x.id, x.created_at into v_ult_id, v_ult_at
    from mensajes_chat x where x.usuario_id = v_uid order by x.created_at desc, x.id desc limit 1;

  insert into resumen_conversacion as r (usuario_id, resumen, pendientes, cubre_hasta_mensaje_id, cubre_hasta_created_at, version, invalidado)
  values (v_uid, '', '[]'::jsonb, v_ult_id, v_ult_at, 1, false)
  on conflict (usuario_id) do update
    set resumen = '', pendientes = '[]'::jsonb, cubre_hasta_mensaje_id = excluded.cubre_hasta_mensaje_id,
        cubre_hasta_created_at = excluded.cubre_hasta_created_at, invalidado = false,
        version = r.version + 1, updated_at = now();

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid and m.estado <> 'borrado';
  get diagnostics v_n = row_count;

  return query select v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- borrar_mensajes_hasta
-- ---------------------------------------------------------------------------
create or replace function borrar_mensajes_hasta(p_corte timestamptz)
returns table (o_mensajes int, o_recuerdos int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mensajes int := 0;
  v_recuerdos int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  -- El resumen primero: puede tener texto de los mensajes que se van.
  perform invalidar_resumen();

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid
     and m.estado <> 'borrado'
     and m.mensaje_origen_id in (select x.id from mensajes_chat x where x.usuario_id = v_uid and x.created_at < p_corte);
  get diagnostics v_recuerdos = row_count;

  delete from mensajes_chat x where x.usuario_id = v_uid and x.created_at < p_corte;
  get diagnostics v_mensajes = row_count;

  return query select v_mensajes, v_recuerdos;
end;
$$;

-- ---------------------------------------------------------------------------
-- guardar_resumen_regenerado (solo service_role)
-- ---------------------------------------------------------------------------
-- Guarda el resumen rearmado solo si la versión sigue siendo la leída y el resumen sigue invalidado (si la persona
-- volvió a olvidar algo mientras se calculaba, la versión cambió y este resultado se descarta). No toca el cursor.
create or replace function guardar_resumen_regenerado(p_usuario uuid, p_resumen text, p_pendientes jsonb, p_version_esperada int)
returns table (o_guardado boolean, o_version int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
begin
  update resumen_conversacion r
     set resumen = p_resumen, pendientes = coalesce(p_pendientes, '[]'::jsonb), invalidado = false,
         version = r.version + 1, updated_at = now()
   where r.usuario_id = p_usuario and r.version = p_version_esperada and r.invalidado
  returning r.version into v_version;
  if found then
    return query select true, v_version;
  else
    return query select false, null::int;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- encolar_tarea_memoria (redefinida; ver cabecera)
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
  -- 'resumir' en curso con la reserva vigente: no se encola otra, esa va a mover la versión del resumen.
  -- 'regenerar' no: la que está en curso trabaja con una versión que ya cambió y su resultado se descarta.
  if p_tipo <> 'regenerar' then
    select t.id into v_id from tareas_memoria t
     where t.usuario_id = p_usuario and t.tipo = p_tipo and t.estado = 'en_curso' and t.reservada_hasta >= now()
     limit 1;
    if v_id is not null then
      return query select v_id, false;
      return;
    end if;
  end if;

  insert into tareas_memoria as t (usuario_id, tipo, version_esperada)
  values (p_usuario, p_tipo, p_version_esperada)
  on conflict (usuario_id, tipo) where estado = 'pendiente' do nothing
  returning t.id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  select t.id into v_id from tareas_memoria t
   where t.usuario_id = p_usuario and t.tipo = p_tipo and t.estado = 'pendiente'
   limit 1;
  return query select v_id, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function invalidar_resumen() from public, anon;
revoke execute on function olvidar_memoria(uuid, uuid[], boolean) from public, anon;
revoke execute on function olvidar_todo_memoria() from public, anon;
revoke execute on function borrar_mensajes_hasta(timestamptz) from public, anon;
grant execute on function invalidar_resumen() to authenticated;
grant execute on function olvidar_memoria(uuid, uuid[], boolean) to authenticated;
grant execute on function olvidar_todo_memoria() to authenticated;
grant execute on function borrar_mensajes_hasta(timestamptz) to authenticated;

revoke all on function guardar_resumen_regenerado(uuid, text, jsonb, int) from public, anon, authenticated;
grant execute on function guardar_resumen_regenerado(uuid, text, jsonb, int) to service_role;
revoke all on function encolar_tarea_memoria(uuid, text, int) from public, anon, authenticated;
grant execute on function encolar_tarea_memoria(uuid, text, int) to service_role;

commit;
