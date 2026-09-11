-- Vitapp — turnos médicos (AgregarTurnoScreen.jsx / Rutina / Home)
-- Mismo patrón single-tenant que el resto: usuario_id directo + RLS propia.

create table turnos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  especialidad text not null,
  profesional text,
  lugar text,
  fecha date not null,
  hora text not null, -- "HH:MM"
  motivo text,
  recordatorio text, -- descriptivo ("1 día antes"...), sin notificación real detrás
  acompanado boolean not null default false, -- solo el flag, no notifica a nadie
  notas text,
  created_at timestamptz not null default now()
);

create index idx_turnos_usuario on turnos(usuario_id);
create index idx_turnos_fecha on turnos(fecha);

alter table turnos enable row level security;

create policy turnos_all_self on turnos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
