-- Vitapp — Web Push: suscripciones, recordatorios cuidador -> elder y
-- contadores de push en el log de alertas de dosis vencida.
--
-- 1. push_suscripciones: una fila por (navegador/dispositivo) suscripto. RLS
--    owner-only. El envío a OTRO usuario (cron hacia cuidadores, "Recordarle"
--    hacia el elder) usa el cliente service_role en lib/notificaciones/push.ts
--    — ver CLAUDE.md, usos sancionados del admin client.
-- 2. registrar_push_suscripcion(): RPC security definer para el upsert por
--    `endpoint`. Hace falta porque un mismo navegador compartido puede pasar
--    de una cuenta a otra: la fila vieja pertenece a OTRO usuario, así que
--    ni un insert ni un update bajo RLS podrían reasignarla. Siempre usa
--    auth.uid(), nunca recibe un usuario como parámetro.
-- 3. recordatorios_dosis: "Recordarle" del cuidador. Sirve de rate-limit
--    (1 por dosis cada 15 min) y de fuente del aviso dentro de la app.
-- 4. alertas_dosis: contadores de push (aditivo).

-- push_suscripciones ---------------------------------------------------------

create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index idx_push_suscripciones_usuario on push_suscripciones (usuario_id);

alter table push_suscripciones enable row level security;

create policy push_suscripciones_select_self on push_suscripciones
  for select using (usuario_id = auth.uid());

create policy push_suscripciones_insert_self on push_suscripciones
  for insert with check (usuario_id = auth.uid());

create policy push_suscripciones_update_self on push_suscripciones
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy push_suscripciones_delete_self on push_suscripciones
  for delete using (usuario_id = auth.uid());

create or replace function registrar_push_suscripcion(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
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

  insert into push_suscripciones (usuario_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent, now())
  on conflict (endpoint) do update
    set usuario_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_used_at = now();
end;
$$;

revoke execute on function registrar_push_suscripcion(text, text, text, text) from public, anon;
grant execute on function registrar_push_suscripcion(text, text, text, text) to authenticated;

-- recordatorios_dosis --------------------------------------------------------

create table recordatorios_dosis (
  id uuid primary key default gen_random_uuid(),
  medicamento_id uuid not null references medicamentos(id) on delete cascade,
  elder_id uuid not null references auth.users(id) on delete cascade,
  cuidador_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null, -- fecha de pared en Argentina (no UTC) de la dosis recordada
  created_at timestamptz not null default now()
);

create index idx_recordatorios_dosis_dosis on recordatorios_dosis (medicamento_id, fecha, created_at desc);
create index idx_recordatorios_dosis_elder on recordatorios_dosis (elder_id, fecha);

alter table recordatorios_dosis enable row level security;

-- El cuidador inserta solo como si mismo, para un elder con vinculo aceptado
-- hacia el, y sobre un medicamento que realmente es de ese elder.
create policy recordatorios_dosis_insert_cuidador on recordatorios_dosis
  for insert with check (
    cuidador_id = auth.uid()
    and exists (
      select 1 from vinculos_cuidador v
      where v.cuidador_id = auth.uid()
        and v.elder_id = recordatorios_dosis.elder_id
        and v.estado = 'aceptado'
    )
    and exists (
      select 1 from medicamentos m
      where m.id = recordatorios_dosis.medicamento_id
        and m.usuario_id = recordatorios_dosis.elder_id
    )
  );

-- Lectura del cuidador: los recordatorios de los elders que cuida (no solo
-- los suyos) para que el rate-limit de 15 min sea por dosis, no por persona.
create policy recordatorios_dosis_select_cuidador on recordatorios_dosis
  for select using (
    elder_id in (
      select elder_id from vinculos_cuidador
      where cuidador_id = auth.uid() and estado = 'aceptado'
    )
  );

-- El elder lee los recordatorios dirigidos a el (banner dentro de la app).
create policy recordatorios_dosis_select_elder on recordatorios_dosis
  for select using (elder_id = auth.uid());

-- alertas_dosis: contadores de push ------------------------------------------

alter table alertas_dosis
  add column push_enviados int not null default 0,
  add column push_fallidos int not null default 0;
