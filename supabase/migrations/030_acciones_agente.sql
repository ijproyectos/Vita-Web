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
  -- Acción destructiva guardada esperando el Confirmar del usuario (borrar o
  -- cambiar el horario de un medicamento; ver lib/chat/confirmaciones.ts).
  -- 'claim' = fila de dedupe/marcador de siempre; 'confirmacion' = acción pendiente.
  tipo text not null default 'claim' check (tipo in ('claim', 'confirmacion')),
  accion jsonb,       -- {tool, destinoId, medicamentoId, persona, cambios?}: lo que se ejecuta, por id
  texto text,         -- lo que se le mostró al usuario ("¿Borro el Losartán de las 08:00?...")
  snapshot jsonb,     -- {id, nombre, dosis, hora_programada, dias_recurrentes} visto al proponer
  vence_at timestamptz, -- created_at + 10 min; después no se ejecuta
  unique (usuario_id, pedido_id, clave)
);

-- A lo sumo UNA confirmación pendiente por usuario: proponer otra reemplaza la anterior.
create unique index uq_acciones_agente_una_confirmacion
  on acciones_agente(usuario_id) where tipo = 'confirmacion';

-- Pensado para limpiar filas viejas por antigüedad (solo sirven durante un
-- reintento). Pendiente: todavía no hay job de limpieza.
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

create policy acciones_agente_delete_self on acciones_agente
  for delete using (usuario_id = auth.uid());
