-- Vitapp — historial de chat
-- Replica sesiones_chat/mensajes_chat el comportamiento de ChatProvider en
-- el Vitapp original (Flutter): historySessions, startNewSession(),
-- clearHistory() — pero persistido en Supabase en vez de en memoria.

create table sesiones_chat (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now() -- se toca en cada mensaje nuevo, para ordenar por actividad
);

create index idx_sesiones_chat_usuario on sesiones_chat(usuario_id, updated_at desc);

create table mensajes_chat (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesiones_chat(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade, -- denormalizado, mismo criterio que medicamentos_tomas
  role text not null check (role in ('user', 'assistant')),
  contenido text not null,
  created_at timestamptz not null default now()
);

create index idx_mensajes_chat_sesion on mensajes_chat(sesion_id, created_at);

alter table sesiones_chat enable row level security;
alter table mensajes_chat enable row level security;

create policy sesiones_chat_all_self on sesiones_chat
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy mensajes_chat_all_self on mensajes_chat
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
