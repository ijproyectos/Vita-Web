-- Vita — control de la persona sobre la memoria: dejar de recordar un recuerdo, olvidar todo y borrar lo derivado de
-- conversaciones que se eliminan (fase 2).
-- ESCRITA pero NO aplicada: aplicar a mano con `psql -1` (después de 038 y 039) y registrar en supabase_migrations.schema_migrations.
-- Idempotente (create or replace). Sin transacción propia: se aplica con `psql -1`.
--
-- Garantía de diseño: ninguna de estas operaciones deja texto derivado vivo. Un recuerdo borrado conserva solo la marca
-- (estado 'borrado', sin texto) y los mensajes de los que salió pasan a `excluido_memoria = true`, así que
-- `buscar_memoria` no los puede volver a encontrar. Los mensajes siguen visibles en el historial del chat: borrarlos es la
-- acción separada "Borrar historial".
--
-- Funciones SECURITY INVOKER (la RLS owner-only de 038 sigue siendo la autoridad; además filtran por auth.uid()):
--   olvidar_memoria                    "dejar de recordar" un recuerdo, sus versiones anteriores y los mensajes de origen.
--   olvidar_todo_memoria               "olvidar todo": todos los recuerdos + TODOS los mensajes de la persona excluidos de la memoria.
--   borrar_recuerdos_de_sesiones_hasta recuerdos que salieron de conversaciones que "Borrar historial" está por borrar.
-- Convención del repo: en funciones con `returns table`, las columnas de salida llevan prefijo `o_` y toda referencia a una
-- columna va calificada con alias.
-- Sin esta migración la app degrada: hace los mismos pasos desde el servidor con el cliente de sesión.

-- ---------------------------------------------------------------------------
-- olvidar_memoria
-- ---------------------------------------------------------------------------
-- Alcanza al recuerdo, a sus versiones anteriores (la cadena corrige_id: 'reemplazado' también guarda texto) y a las
-- fuentes: el mensaje de origen de cada uno y la respuesta de vita a ese mensaje (los assistant de la misma sesión hasta
-- el siguiente mensaje del usuario, porque repiten el dato). Los mensajes quedan `excluido_memoria = true`; no se borran.
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

  -- Recuerdos: sin texto, solo la marca.
  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid and m.estado <> 'borrado' and m.id = any(v_cadena);
  get diagnostics v_recuerdos = row_count;

  -- Mensajes de origen y la respuesta de vita a cada uno.
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

  return query select v_recuerdos, v_mensajes;
end;
$$;

-- ---------------------------------------------------------------------------
-- olvidar_todo_memoria
-- ---------------------------------------------------------------------------
-- Todos los recuerdos quedan 'borrado' sin texto, y TODOS los mensajes de la persona quedan `excluido_memoria = true`:
-- siguen visibles en el chat, pero buscar_memoria no encuentra nada de lo dicho hasta ahora. Los mensajes nuevos vuelven a
-- contar (si la memoria sigue activa).
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

  return query select v_recuerdos, v_mensajes;
end;
$$;

-- ---------------------------------------------------------------------------
-- borrar_recuerdos_de_sesiones_hasta
-- ---------------------------------------------------------------------------
-- "Borrar historial" borra las sesiones de chat con `updated_at` anterior al corte (y por cascade sus mensajes). Esto deja
-- 'borrado' sin texto todo recuerdo que salió de un mensaje de esas sesiones. Se llama ANTES de borrar las sesiones (después
-- ya no se podrían encontrar los mensajes de origen). Devuelve cuántos recuerdos alcanzó.
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
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function olvidar_memoria(uuid) from public, anon;
revoke execute on function olvidar_todo_memoria() from public, anon;
revoke execute on function borrar_recuerdos_de_sesiones_hasta(timestamptz) from public, anon;
grant execute on function olvidar_memoria(uuid) to authenticated;
grant execute on function olvidar_todo_memoria() to authenticated;
grant execute on function borrar_recuerdos_de_sesiones_hasta(timestamptz) to authenticated;
