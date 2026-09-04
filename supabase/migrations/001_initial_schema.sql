-- Vitapp — schema inicial
-- Single-tenant por usuario (no hay multi-tenant como en NutrIA): cada fila
-- de negocio lleva usuario_id directo, referenciando auth.users.
-- Corre completo a mano vía psql/pooler la primera vez que se crea el proyecto Supabase.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- =========================================================
-- perfiles (1:1 con auth.users, se crea/actualiza en el primer login)
-- =========================================================
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- medicamentos
-- =========================================================
create table medicamentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  dosis text,
  hora_programada text not null, -- "HH:MM"
  momento_dia text not null check (momento_dia in ('mañana', 'mediodia', 'noche')),
  condicion text,
  -- Días de la semana en que aplica ('lunes'..'domingo'); array vacío = todos los días.
  dias_recurrentes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_medicamentos_usuario on medicamentos(usuario_id);

-- =========================================================
-- medicamentos_tomas (adherencia, una fila por medicamento+fecha)
-- =========================================================
create table medicamentos_tomas (
  id uuid primary key default gen_random_uuid(),
  medicamento_id uuid not null references medicamentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null,
  tomado boolean not null default false,
  tomado_en timestamptz,
  created_at timestamptz not null default now(),
  unique (medicamento_id, fecha)
);

create index idx_medicamentos_tomas_usuario on medicamentos_tomas(usuario_id);
create index idx_medicamentos_tomas_fecha on medicamentos_tomas(fecha);
