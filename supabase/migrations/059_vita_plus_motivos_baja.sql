-- 059: por qué alguien da de baja vita+ (opcional, como en el diseño).
--
-- "Dar de baja" ofrece "¿Por qué te vas? · opcional" (Es caro / No lo uso /
-- Uso otra app / Otro). Se guarda SOLO si la persona elige uno, después de
-- cancelar con éxito, con el cliente service_role (mismo uso sancionado que la
-- cancelación, ver lib/supabase/admin.ts). Sin esta tabla la baja funciona
-- igual y el motivo no se guarda. Sin texto libre ni datos de salud.

create table if not exists vita_plus_motivos_baja (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  motivo text not null check (motivo in ('caro', 'no_lo_uso', 'otra_app', 'otro')),
  created_at timestamptz not null default now()
);

create index if not exists idx_vita_plus_motivos_baja_fecha on vita_plus_motivos_baja (created_at desc);

-- Sin policies: solo service_role escribe y lee.
alter table vita_plus_motivos_baja enable row level security;
