-- Vitapp — Mi Salud: registros de "Consultas" y "Vacunas".
--
-- El diseño V7 las muestra como filas del feed "Registros" (fecha, título,
-- subtítulo y la etiqueta MANUAL / VITA). No tiene pantalla de alta, así que
-- la UI solo las lista; las filas las puede cargar vita desde el chat más
-- adelante (`origen = 'vita'`) o a mano (`origen = 'manual'`).
--
-- `estudios.valores` ya es jsonb libre, así que los rangos de referencia por
-- valor (unidad, rango_min, rango_max, rango_texto, estado) se guardan ahí sin
-- migración: [{nombre, valor, unidad?, rango_min?, rango_max?, rango_texto?, estado?}].
--
-- RLS (mismo criterio que mediciones en 022):
--   - el dueño tiene CRUD directo (`*_all_self`);
--   - un cuidador con vínculo aceptado LEE (`es_cuidador_de`, cualquier rol);
--   - un cuidador con rol 'editar' escribe (`puede_editar_de`).
--
-- Esta migración está escrita pero NO aplicada todavía.

create table consultas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null default current_date,
  especialidad text not null check (char_length(especialidad) between 1 and 120),
  profesional text check (profesional is null or char_length(profesional) <= 120),
  lugar text check (lugar is null or char_length(lugar) <= 160),
  resumen text check (resumen is null or char_length(resumen) <= 500),
  origen text not null default 'manual' check (origen in ('manual', 'vita')),
  created_at timestamptz not null default now()
);

create index idx_consultas_usuario_fecha on consultas (usuario_id, fecha desc);

create table vacunas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 120),
  fecha date not null default current_date,
  dosis text check (dosis is null or char_length(dosis) <= 60),
  lugar text check (lugar is null or char_length(lugar) <= 160),
  origen text not null default 'manual' check (origen in ('manual', 'vita')),
  created_at timestamptz not null default now()
);

create index idx_vacunas_usuario_fecha on vacunas (usuario_id, fecha desc);

-- RLS ----------------------------------------------------------------------

alter table consultas enable row level security;

create policy consultas_all_self on consultas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy consultas_select_cuidador on consultas
  for select using (es_cuidador_de(usuario_id));
create policy consultas_insert_cuidador on consultas
  for insert with check (puede_editar_de(usuario_id));
create policy consultas_update_cuidador on consultas
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy consultas_delete_cuidador on consultas
  for delete using (puede_editar_de(usuario_id));

alter table vacunas enable row level security;

create policy vacunas_all_self on vacunas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy vacunas_select_cuidador on vacunas
  for select using (es_cuidador_de(usuario_id));
create policy vacunas_insert_cuidador on vacunas
  for insert with check (puede_editar_de(usuario_id));
create policy vacunas_update_cuidador on vacunas
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy vacunas_delete_cuidador on vacunas
  for delete using (puede_editar_de(usuario_id));
