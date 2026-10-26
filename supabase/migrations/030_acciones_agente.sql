-- Reintentos del chat sin duplicar escrituras.
-- Cada mensaje del chat lleva un `pedido_id` generado por la app. Antes de
-- ejecutar una tool que ESCRIBE (add_medication, mark_taken...), el servidor
-- reclama una fila acá con clave única (usuario, pedido, clave de la acción).
-- Si el usuario reintenta el mismo pedido y la fila ya existe, la acción NO se
-- vuelve a ejecutar: se le devuelve al modelo el `resultado` guardado.
-- La clave = `destino~tool:campos que identifican la acción`, normalizados (ver claveSemantica en lib/chat/pedidos.ts); no el input entero,
-- porque el modelo puede reformularlo en un reintento.

create table acciones_agente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  pedido_id uuid not null,
  clave text not null,
  resultado jsonb, -- {contenido, accionUI}; null mientras la acción se está ejecutando
  created_at timestamptz not null default now(),
  unique (usuario_id, pedido_id, clave)
);

-- RETENCIÓN: la tabla guarda datos de salud del chat (también de terceras
-- personas: `resultado` y los pendientes con la acción completa). Solo sirve
-- durante un reintento o una confirmación de minutos, así que el cron
-- existente `dosis-vencidas` (app/api/cron/dosis-vencidas, cliente admin
-- sancionado) borra las filas de más de 48 h en cada tick. No hay job nuevo.
-- Filas `pendiente:<clave>`: `resultado = {pendiente: {tool, input, destinoId,
-- persona}}` (la acción exacta que el usuario tiene que confirmar, atada a esa
-- fila por su id); `confirmada:<clave>` es el marcador de consumo.
create index idx_acciones_agente_created_at on acciones_agente(created_at);

alter table acciones_agente enable row level security;

-- Owner-only, mismo criterio que sesiones_chat/mensajes_chat. Se usa el cliente
-- de sesión (nunca service_role). La policy de delete existe para que el dueño
-- libere su propio claim cuando la ejecución falló o quedó huérfano (vencido).
create policy acciones_agente_select_self on acciones_agente
  for select using (usuario_id = auth.uid());

create policy acciones_agente_insert_self on acciones_agente
  for insert with check (usuario_id = auth.uid());

create policy acciones_agente_update_self on acciones_agente
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Una policy no limita columnas: el único campo que cambia legítimamente en
-- una fila existente es `resultado` (se completa tras ejecutar). Se recortan
-- los privilegios de UPDATE a esa columna, así el dueño no puede reescribir
-- `usuario_id`/`pedido_id`/`clave`/`created_at` (p. ej. rejuvenecer una
-- pendiente vencida). El insert con `on conflict do nothing` no usa UPDATE.
revoke update on acciones_agente from anon, authenticated;
grant update (resultado) on acciones_agente to authenticated;

create policy acciones_agente_delete_self on acciones_agente
  for delete using (usuario_id = auth.uid());
