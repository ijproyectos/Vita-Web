-- Vitapp — índices para la retención del chat (7 días)
-- Aplicar con: psql -1 -f 051_indices_retencion_chat.sql   (idempotente)
--
-- El chat pasó a ser un hilo continuo de 7 días: el cron `dosis-vencidas` borra por tandas los mensajes con
-- `created_at` anterior al corte y las sesiones sin actividad. Esos barridos filtran por la fecha SIN usuario, así que
-- necesitan su propio índice (el de la 050 es por usuario + fecha). Más dos funciones (abajo). No cambia ninguna columna, FK ni policy.
--
-- Qué NO cambia, a propósito (verificado): `memorias.mensaje_origen_id` y `resumen_conversacion.cubre_hasta_mensaje_id`
-- no tienen FK a `mensajes_chat`, y el cursor del resumen compara por (created_at, id); borrar mensajes viejos no borra
-- recuerdos ni rompe al trabajador del resumen (sigue con los mensajes posteriores al cursor, exista o no el del cursor).

create index if not exists idx_mensajes_chat_creado
  on public.mensajes_chat (created_at);

create index if not exists idx_sesiones_chat_actualizada
  on public.sesiones_chat (updated_at);

-- ---------------------------------------------------------------------------
-- borrar_recuerdos_hasta: "Borrar historial" con el chat continuo
-- ---------------------------------------------------------------------------
-- La sesión del hilo continuo siempre tiene `updated_at` reciente y la retención de 7 días puede haber borrado ya los
-- mensajes de origen, así que `borrar_recuerdos_de_sesiones_hasta` (por sesión) ya no alcanza. Esta deja borrado sin
-- texto todo recuerdo no borrado cuyo mensaje de origen es anterior al corte, o cuyo mensaje de origen ya no existe y se
-- creó antes del corte. Los recuerdos sin mensaje de origen (cargados a mano) no salieron de una conversación: no se tocan.
-- Mismo permiso que las de la 040: SECURITY INVOKER con auth.uid() (RLS owner-only).
create or replace function borrar_recuerdos_hasta(p_corte timestamptz)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int := 0;
  v_hay boolean;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  v_hay := exists (select 1 from mensajes_chat x where x.usuario_id = v_uid and x.created_at < p_corte)
        or exists (select 1 from resumen_conversacion r where r.usuario_id = v_uid and r.cubre_hasta_created_at < p_corte);

  -- Primero lo pendiente de consolidar, después los recuerdos.
  if v_hay then
    perform descartar_consolidacion_pendiente();
  end if;

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid
     and m.estado <> 'borrado'
     and m.mensaje_origen_id is not null
     and (
       exists (
         select 1 from mensajes_chat x
          where x.id = m.mensaje_origen_id and x.usuario_id = v_uid and x.created_at < p_corte
       )
       or (
         m.created_at < p_corte
         and not exists (select 1 from mensajes_chat x where x.id = m.mensaje_origen_id and x.usuario_id = v_uid)
       )
     );
  get diagnostics v_n = row_count;

  -- El resumen pudo salir de mensajes que se van: se vacía.
  if v_hay or v_n > 0 then
    perform invalidar_resumen();
  end if;
  return v_n;
end;
$$;

revoke execute on function borrar_recuerdos_hasta(timestamptz) from public, anon;
grant execute on function borrar_recuerdos_hasta(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- purgar_sesiones_vacias: retención de sesiones sin carreras
-- ---------------------------------------------------------------------------
-- Borra (solo service_role, desde el cron) sesiones sin actividad desde `p_corte` que NO tienen mensajes y que NO son la
-- más reciente (por created_at, desempate por id) de su dueño: esa es la que `obtenerSesionActiva` entrega. El chequeo
-- "sin mensajes" va en el mismo DELETE, así un mensaje insertado en el medio impide el borrado.
create or replace function purgar_sesiones_vacias(p_corte timestamptz, p_max int default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with candidatas as (
    select s.id
      from sesiones_chat s
     where s.updated_at < p_corte
       and not exists (select 1 from mensajes_chat m where m.sesion_id = s.id)
       and exists (
         select 1 from sesiones_chat o
          where o.usuario_id = s.usuario_id and o.id <> s.id and (o.created_at, o.id) > (s.created_at, s.id)
       )
     order by s.updated_at, s.id
     limit greatest(1, least(coalesce(p_max, 200), 1000))
       for update of s skip locked
  )
  delete from sesiones_chat d
   using candidatas c
   where d.id = c.id
     and not exists (select 1 from mensajes_chat m where m.sesion_id = d.id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function purgar_sesiones_vacias(timestamptz, int) from public, anon, authenticated;
grant execute on function purgar_sesiones_vacias(timestamptz, int) to service_role;
