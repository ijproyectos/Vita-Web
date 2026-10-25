-- Vita — memoria persistente del chat (etapa 1).
-- ESCRITA pero NO aplicada: aplicar a mano con psql y registrar en supabase_migrations.schema_migrations.
--
-- Un solo hilo de conversación por persona, recuerdos por persona, resumen vigente y cola de trabajo.
-- Decisión de privacidad: la memoria es SOLO del dueño (quien la contó). Ninguna policy de cuidador:
-- ni la persona cuidada ni otros cuidadores ven estas tablas. `tareas_memoria` no tiene policies
-- (solo service_role, el trabajador de segundo plano).
-- Todo en una transacción.

begin;

-- ---------------------------------------------------------------------------
-- mensajes_chat: hilo único, bloques completos, búsqueda
-- ---------------------------------------------------------------------------
-- `sesion_id` pasa a ser opcional: el hilo ya no depende de una sesión. Las filas viejas la conservan.
alter table mensajes_chat alter column sesion_id drop not null;

-- Bloques de contenido del turno (text, tool_use, tool_result). Nunca razonamiento (thinking) de turnos
-- anteriores. Formato: ver lib/memoria/tipos.ts (BloquesTurno).
alter table mensajes_chat add column bloques jsonb;
-- Tokens de salida del turno cuando se conocen (null en mensajes del usuario y en filas viejas).
alter table mensajes_chat add column tokens int check (tokens is null or tokens >= 0);
-- Identificador del pedido de la app (mismo que acciones_agente.pedido_id): nada lo tenía en mensajes_chat.
alter table mensajes_chat add column pedido_id uuid;
-- Marca "dejar de recordar": sigue visible en el historial pero no entra en búsqueda, resúmenes ni extracción.
alter table mensajes_chat add column excluido_memoria boolean not null default false;
-- Búsqueda de texto en español sobre lo que dijo cada uno.
alter table mensajes_chat add column busqueda tsvector
  generated always as (to_tsvector('spanish', coalesce(contenido, ''))) stored;

create index idx_mensajes_chat_busqueda on mensajes_chat using gin (busqueda);
-- Ventana reciente y paginación por cursor (created_at, id) con orden estable, a través de sesiones.
create index idx_mensajes_chat_hilo on mensajes_chat (usuario_id, created_at, id);

-- ---------------------------------------------------------------------------
-- perfiles: interruptor y aviso de primera vez
-- ---------------------------------------------------------------------------
alter table perfiles add column memoria_activa boolean not null default true;
alter table perfiles add column memoria_aviso_visto_at timestamptz;

-- ---------------------------------------------------------------------------
-- memorias: un recuerdo por fila
-- ---------------------------------------------------------------------------
create table memorias (
  id uuid primary key default gen_random_uuid(),
  -- Dueño: quien lo contó. Se borra con la cuenta.
  usuario_id uuid not null references auth.users(id) on delete cascade,
  -- Sobre quién es: la propia persona, un familiar con perfil, u otra persona nombrada a mano.
  sobre_tipo text not null check (sobre_tipo in ('yo', 'familiar', 'otro')),
  sobre_perfil_id uuid, -- perfil del familiar cuando se sabe (sin FK: el recuerdo sobrevive a que se desvincule)
  sobre_nombre text,    -- nombre libre ("Laura") cuando no hay perfil
  clave text not null,  -- tema estable ("dia_de_visita"): misma clave = corregir, no duplicar
  texto text,           -- corto; null/vacío solo si está borrado
  tipo text not null default 'estable' check (tipo in ('estable', 'pasajero')),
  vence_at timestamptz, -- pasajeros: +3 días
  estado text not null default 'vigente' check (estado in ('vigente', 'reemplazado', 'borrado')),
  corrige_id uuid references memorias(id) on delete set null,
  destacado boolean not null default false,
  usos int not null default 0 check (usos >= 0),
  origen text not null default 'chat' check (origen in ('chat', 'consolidacion', 'usuario')),
  mensaje_origen_id uuid, -- sin FK: si se borra el mensaje, el recuerdo (o su marca de borrado) queda
  busqueda tsvector generated always as (to_tsvector('spanish', coalesce(texto, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un recuerdo borrado no conserva el texto: queda solo la marca, para que nada lo reviva.
  constraint memorias_borrado_sin_texto check (estado <> 'borrado' or texto is null or texto = ''),
  constraint memorias_texto_si_no_borrado check (estado = 'borrado' or (texto is not null and texto <> '')),
  -- Un pasajero siempre vence y nunca es destacado.
  constraint memorias_pasajero_vence check (tipo <> 'pasajero' or (vence_at is not null and not destacado)),
  constraint memorias_sobre_coherente check (
    (sobre_tipo = 'yo' and sobre_perfil_id is null and sobre_nombre is null)
    or (sobre_tipo = 'familiar' and (sobre_perfil_id is not null or sobre_nombre is not null))
    or (sobre_tipo = 'otro' and sobre_nombre is not null)
  )
);

-- Un solo vigente por (dueño, sobre quién, clave). `sobre` se normaliza: 'yo', 'perfil:<id>' o 'nombre:<minúsculas>'.
create unique index idx_memorias_un_vigente on memorias (
  usuario_id,
  (case
     when sobre_tipo = 'yo' then 'yo'
     when sobre_perfil_id is not null then 'perfil:' || sobre_perfil_id::text
     else 'nombre:' || lower(coalesce(sobre_nombre, ''))
   end),
  clave
) where estado = 'vigente';

create index idx_memorias_destacadas on memorias (usuario_id, usos desc) where estado = 'vigente' and destacado;
create index idx_memorias_vencen on memorias (vence_at) where estado = 'vigente' and vence_at is not null;
create index idx_memorias_busqueda on memorias using gin (busqueda);

alter table memorias enable row level security;

-- Solo el dueño. Sin policies de cuidador, a propósito.
create policy memorias_select_self on memorias for select using (usuario_id = auth.uid());
create policy memorias_insert_self on memorias for insert with check (usuario_id = auth.uid());
create policy memorias_update_self on memorias for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy memorias_delete_self on memorias for delete using (usuario_id = auth.uid());

-- ---------------------------------------------------------------------------
-- resumen_conversacion: una fila por persona
-- ---------------------------------------------------------------------------
create table resumen_conversacion (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  resumen text not null default '',
  pendientes jsonb not null default '[]'::jsonb, -- asuntos abiertos de la charla (lista corta de textos)
  cubre_hasta_mensaje_id uuid,                  -- último mensaje cubierto (sin FK)
  cubre_hasta_created_at timestamptz,           -- su created_at, para el cursor (created_at, id)
  version int not null default 0,               -- control optimista: se reemplaza solo si no cambió
  updated_at timestamptz not null default now()
);

alter table resumen_conversacion enable row level security;

create policy resumen_conversacion_select_self on resumen_conversacion for select using (usuario_id = auth.uid());
create policy resumen_conversacion_insert_self on resumen_conversacion for insert with check (usuario_id = auth.uid());
create policy resumen_conversacion_update_self on resumen_conversacion for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy resumen_conversacion_delete_self on resumen_conversacion for delete using (usuario_id = auth.uid());

-- ---------------------------------------------------------------------------
-- tareas_memoria: cola de segundo plano
-- ---------------------------------------------------------------------------
create table tareas_memoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('resumir', 'regenerar', 'consolidar')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha', 'fallida')),
  reservada_hasta timestamptz,              -- reserva vencible del trabajador (~2 min)
  intentos int not null default 0 check (intentos >= 0),
  version_esperada int,                     -- versión del resumen al encolar
  error text,
  created_at timestamptz not null default now()
);

-- Una sola tarea pendiente por persona y tipo.
create unique index idx_tareas_memoria_una_pendiente on tareas_memoria (usuario_id, tipo) where estado = 'pendiente';
create index idx_tareas_memoria_cola on tareas_memoria (estado, reservada_hasta, created_at);

alter table tareas_memoria enable row level security;
-- Deliberadamente sin policies: solo service_role (bypassa RLS).

commit;
