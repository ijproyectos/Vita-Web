-- 061: "Posponer N minutos" en "Es hora de medirte…" del modo simple.
--
-- Igual que `posposiciones` (020) para las dosis: la persona pospone un horario
-- de un plan de monitoreo (053) y el cron `dosis-vencidas` vuelve a mandar
-- "Hora de medir…" cuando vence, si todavía no anotó la medición.
-- Owner-only; el insert exige que el plan sea del usuario. Escrita, NO aplicada.
-- Requisitos: 053 (monitoreos).

create table posposiciones_medicion (
  id uuid primary key default gen_random_uuid(),
  monitoreo_id uuid not null references monitoreos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null, -- fecha de pared AR
  hora text not null check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), -- horario del plan pospuesto
  hasta timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_posposiciones_medicion_hasta on posposiciones_medicion (hasta);
create index idx_posposiciones_medicion_plan on posposiciones_medicion (monitoreo_id, fecha, hora);

alter table posposiciones_medicion enable row level security;

create policy posposiciones_medicion_select_self on posposiciones_medicion
  for select using (usuario_id = auth.uid());

create policy posposiciones_medicion_insert_self on posposiciones_medicion
  for insert with check (
    usuario_id = auth.uid()
    and exists (
      select 1 from monitoreos m
      where m.id = posposiciones_medicion.monitoreo_id and m.usuario_id = auth.uid()
    )
  );

create policy posposiciones_medicion_delete_self on posposiciones_medicion
  for delete using (usuario_id = auth.uid());
