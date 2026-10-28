-- Nota: escrita pero NO aplicada. Aplicar a mano con psql (no `db push`) y registrar en schema_migrations.
-- Confirmaciones del chat para borrar / cambiar un horario (también sobre datos propios).
--
-- DISEÑO: NO hay mecanismo paralelo. Estas confirmaciones usan las MISMAS filas
-- `pendiente:<clave>` de acciones_agente (030) que las escrituras sobre otra persona, así que
-- no hace falta ninguna columna nueva: la acción exacta (tool, input, destino, sesión y, para
-- delete_schedule/update_schedule, el `objetivo` = id de la fila + snapshot + texto + cambios)
-- vive dentro de `resultado.pendiente` (jsonb). Esta migración solo es ADITIVA e idempotente.
--
-- NO TOCA los privilegios de 030: UPDATE sigue limitado a la columna `resultado`
-- (`grant update (resultado)`), así el dueño no puede reescribir usuario_id/pedido_id/clave/
-- created_at (p. ej. rejuvenecer una pendiente vencida). Las pendientes se crean con INSERT,
-- se consumen con DELETE (ambos con policy owner-only) y nunca necesitan otra columna.
--
-- Qué agrega: un índice parcial para las consultas que hace el servidor sobre pendientes
-- (limpiar con un "no", buscar la vigente de la sesión, contar las vigentes) que antes
-- recorrían todas las filas del usuario.

create index if not exists idx_acciones_agente_pendientes
  on acciones_agente (usuario_id, created_at)
  where clave like 'pendiente:%';
