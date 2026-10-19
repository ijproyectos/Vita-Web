-- Vitapp — Fase 2 (V7): Avisos. Centro de notificaciones, preferencias,
-- posposiciones del lado del servidor y dedupe de los avisos programados.
--
-- Escrita pero NO aplicada (la aplica quien tenga la password de DB).
-- Requisitos previos: 008 (alertas_dosis), 014 (inventario_pastillas), 017.
--
-- 1. avisos: feed del centro de notificaciones (/app/avisos). Una fila por
--    aviso entregado a un usuario (push o no). Escritura SOLO desde código de
--    sistema con service_role (cron, "Recordarle"): no hay policy de insert, a
--    propósito — así nadie puede fabricarse avisos propios ni ajenos, y no
--    hace falta una función security definer (que sería una superficie más:
--    recibiría un destinatario como parámetro). El dueño lee, marca leído
--    (único UPDATE permitido: column grant sobre leido_at) y borra.
-- 2. preferencias_avisos: owner-only. Sin fila = defaults del código
--    (lib/notificaciones/avisos-tipos.ts): todo activado, sin silencio,
--    espera de 30 min. El cron la lee con service_role.
-- 3. posposiciones: "En 15 min" del lado del servidor (acción del push, modo
--    simple). Owner-only; el insert además exige que la dosis sea del usuario.
-- 4. envios_avisos: dedupe claim-before-send de los avisos programados
--    (unique tipo+ref_id+fecha). Sin policies: solo service_role.
-- 5. alertas_dosis.resuelta_at: marca el "ya tomó" que reemplaza a la alerta.

-- avisos ---------------------------------------------------------------------

create table avisos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text not null default '',
  url text,
  datos jsonb not null default '{}'::jsonb,
  leido_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_avisos_usuario_fecha on avisos (usuario_id, created_at desc);
create index idx_avisos_no_leidos on avisos (usuario_id) where leido_at is null;

alter table avisos enable row level security;

create policy avisos_select_self on avisos
  for select using (usuario_id = auth.uid());

create policy avisos_update_self on avisos
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy avisos_delete_self on avisos
  for delete using (usuario_id = auth.uid());

-- RLS es de fila, no de columna: el único campo que el usuario puede tocar es
-- leido_at (no puede reescribir título/url/datos de un aviso).
revoke update on avisos from authenticated, anon;
grant update (leido_at) on avisos to authenticated;
revoke insert on avisos from authenticated, anon;

-- preferencias_avisos ----------------------------------------------------------

create table preferencias_avisos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  -- Silencio nocturno: ambos null = apagado. Puede cruzar la medianoche.
  silencio_desde time,
  silencio_hasta time,
  -- Cuánto esperar (tras avisarle a la persona) antes de avisar al cuidador.
  espera_cuidador_min int not null default 30 check (espera_cuidador_min in (30, 60, 120)),
  recordatorio_dosis boolean not null default true,
  aviso_turnos boolean not null default true,
  stock_bajo boolean not null default true,
  updated_at timestamptz not null default now(),
  check ((silencio_desde is null) = (silencio_hasta is null))
);

alter table preferencias_avisos enable row level security;

create policy preferencias_avisos_all_self on preferencias_avisos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- posposiciones ----------------------------------------------------------------

create table posposiciones (
  id uuid primary key default gen_random_uuid(),
  medicamento_id uuid not null references medicamentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null, -- fecha de pared AR de la dosis pospuesta
  hasta timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_posposiciones_dosis on posposiciones (medicamento_id, fecha, hasta desc);
create index idx_posposiciones_hasta on posposiciones (hasta);

alter table posposiciones enable row level security;

create policy posposiciones_select_self on posposiciones
  for select using (usuario_id = auth.uid());

create policy posposiciones_insert_self on posposiciones
  for insert with check (
    usuario_id = auth.uid()
    and exists (
      select 1 from medicamentos m
      where m.id = posposiciones.medicamento_id and m.usuario_id = auth.uid()
    )
  );

create policy posposiciones_delete_self on posposiciones
  for delete using (usuario_id = auth.uid());

-- envios_avisos -----------------------------------------------------------------

create table envios_avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  ref_id uuid not null, -- medicamento / turno / inventario / posposicion según tipo
  fecha date not null,  -- fecha de pared AR (dosis o turno)
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tipo, ref_id, fecha)
);

create index idx_envios_avisos_fecha on envios_avisos (fecha);

-- Sin policies: solo service_role (cron).
alter table envios_avisos enable row level security;

-- alertas_dosis -----------------------------------------------------------------

alter table alertas_dosis add column resuelta_at timestamptz;
