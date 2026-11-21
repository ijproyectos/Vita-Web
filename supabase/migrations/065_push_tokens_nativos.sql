-- Vitapp — Push nativo (FCM) para la app Android (Capacitor): tokens de dispositivo.
--
-- Escrita, NO aplicada. Aplicarla a mano cuando el usuario lo pida.
--
-- 1. push_tokens_nativos: una fila por token de FCM (dispositivo/instalación).
--    RLS owner-only. El envío a OTRO usuario (cron, "Recordarle", avisos a
--    cuidadores) usa el cliente service_role en lib/notificaciones/push.ts,
--    igual que push_suscripciones (017) — ver CLAUDE.md.
-- 2. registrar_push_token_nativo(): RPC security definer para el upsert por
--    `token`. Un celular compartido puede pasar de una cuenta a otra: la fila
--    vieja es de OTRO usuario y bajo RLS ni un insert ni un update podrían
--    reasignarla. Siempre usa auth.uid(), nunca recibe un usuario.

create table push_tokens_nativos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  plataforma text not null check (plataforma in ('android', 'ios')),
  app_version text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index idx_push_tokens_nativos_usuario on push_tokens_nativos (usuario_id);

alter table push_tokens_nativos enable row level security;

create policy push_tokens_nativos_select_self on push_tokens_nativos
  for select using (usuario_id = auth.uid());

create policy push_tokens_nativos_insert_self on push_tokens_nativos
  for insert with check (usuario_id = auth.uid());

create policy push_tokens_nativos_update_self on push_tokens_nativos
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy push_tokens_nativos_delete_self on push_tokens_nativos
  for delete using (usuario_id = auth.uid());

create or replace function registrar_push_token_nativo(
  p_token text,
  p_plataforma text,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  insert into push_tokens_nativos (usuario_id, token, plataforma, app_version, last_used_at)
  values (auth.uid(), p_token, p_plataforma, p_app_version, now())
  on conflict (token) do update
    set usuario_id = auth.uid(),
        plataforma = excluded.plataforma,
        app_version = excluded.app_version,
        last_used_at = now();
end;
$$;

revoke execute on function registrar_push_token_nativo(text, text, text) from public, anon;
grant execute on function registrar_push_token_nativo(text, text, text) to authenticated;
