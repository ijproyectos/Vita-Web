-- 060: valoración de las respuestas de vita (pulgar arriba / abajo).
--
-- Una fila por (persona, mensaje del asistente): valor 1 o -1 y, opcional, un motivo de una lista corta. NO guarda texto del
-- mensaje. Si el mensaje se borra (retención de 7 días del chat, "Borrar historial", borrar la cuenta), la valoración se va
-- con él por la cascada. Idempotente.
--
-- Rollback:
--   drop table if exists public.chat_valoraciones;

create table if not exists public.chat_valoraciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  mensaje_id uuid not null references public.mensajes_chat(id) on delete cascade,
  valor smallint not null check (valor in (-1, 1)),
  motivo text null check (motivo is null or char_length(motivo) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, mensaje_id)
);

create index if not exists idx_chat_valoraciones_creado on public.chat_valoraciones (created_at desc);

alter table public.chat_valoraciones enable row level security;

revoke all on table public.chat_valoraciones from public, anon;
grant select, insert, delete on table public.chat_valoraciones to authenticated;
grant update (valor, motivo, updated_at) on table public.chat_valoraciones to authenticated;
grant select on table public.chat_valoraciones to service_role;

drop policy if exists chat_valoraciones_select_self on public.chat_valoraciones;
create policy chat_valoraciones_select_self on public.chat_valoraciones
  for select to authenticated
  using (usuario_id = (select auth.uid()));

-- Solo se valora un mensaje del asistente que es de la propia persona.
drop policy if exists chat_valoraciones_insert_self on public.chat_valoraciones;
create policy chat_valoraciones_insert_self on public.chat_valoraciones
  for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.mensajes_chat m
      where m.id = mensaje_id and m.usuario_id = (select auth.uid()) and m.role = 'assistant'
    )
  );

drop policy if exists chat_valoraciones_update_self on public.chat_valoraciones;
create policy chat_valoraciones_update_self on public.chat_valoraciones
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.mensajes_chat m
      where m.id = mensaje_id and m.usuario_id = (select auth.uid()) and m.role = 'assistant'
    )
  );

drop policy if exists chat_valoraciones_delete_self on public.chat_valoraciones;
create policy chat_valoraciones_delete_self on public.chat_valoraciones
  for delete to authenticated
  using (usuario_id = (select auth.uid()));
