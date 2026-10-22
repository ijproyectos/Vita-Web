-- Vitapp — Rutina V7: datos de las hojas de detalle (medicamento y turno) y
-- recetas de "Próximos".
--
--   medicamentos.indicado_por  "Indicado por Dra. Ferreyra · Endocrinología"
--   medicamentos.fecha_inicio  "Desde" del detalle (si es null se usa created_at)
--   turnos.direccion           dirección + "Cómo llegar"
--   turnos.telefono            "Llamar al consultorio"
--   turnos.llevar              checklist "Qué llevar": [{"t": "DNI", "ok": false}, ...]
--   recetas                    "Nueva receta · retirar en farmacia" en Próximos
--
-- Todas las columnas son opcionales: la app degrada (oculta el dato) mientras
-- esta migración no esté aplicada. Las columnas nuevas heredan las policies de
-- fila de `medicamentos`/`turnos` (021); `recetas` usa el mismo esquema que
-- `mediciones` (022): dueño CRUD, cuidador lee, rol 'editar' escribe.
--
-- Esta migración está escrita pero NO aplicada todavía.

alter table medicamentos
  add column if not exists indicado_por text check (indicado_por is null or char_length(indicado_por) <= 120),
  add column if not exists fecha_inicio date;

alter table turnos
  add column if not exists direccion text check (direccion is null or char_length(direccion) <= 200),
  add column if not exists telefono text check (telefono is null or char_length(telefono) <= 40),
  add column if not exists llevar jsonb not null default '[]'::jsonb
    check (jsonb_typeof(llevar) = 'array' and jsonb_array_length(llevar) <= 30);

create table if not exists recetas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 120),
  detalle text check (detalle is null or char_length(detalle) <= 200),
  fecha date not null,
  retirada boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_recetas_usuario_fecha on recetas (usuario_id, fecha);

alter table recetas enable row level security;

create policy recetas_all_self on recetas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy recetas_select_cuidador on recetas
  for select using (es_cuidador_de(usuario_id));
create policy recetas_insert_cuidador on recetas
  for insert with check (puede_editar_de(usuario_id));
create policy recetas_update_cuidador on recetas
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy recetas_delete_cuidador on recetas
  for delete using (puede_editar_de(usuario_id));
