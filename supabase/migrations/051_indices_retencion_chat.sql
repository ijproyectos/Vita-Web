-- Vitapp — índices para la retención del chat (7 días)
-- Aplicar con: psql -1 -f 051_indices_retencion_chat.sql   (idempotente)
--
-- El chat pasó a ser un hilo continuo de 7 días: el cron `dosis-vencidas` borra por tandas los mensajes con
-- `created_at` anterior al corte y las sesiones sin actividad. Esos barridos filtran por la fecha SIN usuario, así que
-- necesitan su propio índice (el de la 050 es por usuario + fecha). Solo índices: no cambia ninguna columna, FK ni policy.
--
-- Qué NO cambia, a propósito (verificado): `memorias.mensaje_origen_id` y `resumen_conversacion.cubre_hasta_mensaje_id`
-- no tienen FK a `mensajes_chat`, y el cursor del resumen compara por (created_at, id); borrar mensajes viejos no borra
-- recuerdos ni rompe al trabajador del resumen (sigue con los mensajes posteriores al cursor, exista o no el del cursor).

create index if not exists idx_mensajes_chat_creado
  on public.mensajes_chat (created_at);

create index if not exists idx_sesiones_chat_actualizada
  on public.sesiones_chat (updated_at);
