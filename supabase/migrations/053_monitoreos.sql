-- 053: "Nuevo monitoreo" (VitaApp V7 nuevo): planes de medición y métrica "Otra".
--
-- `monitoreos` guarda QUÉ medir y CUÁNDO; una medición cargada sigue siendo una
-- fila de `mediciones`. Una métrica tiene un solo plan: guardarla de nuevo lo
-- reemplaza. `horarios` = [{hora: "HH:MM", conComida, indicacion}], de 1 a 4.
-- `fecha_fin` es inclusive (mismo criterio que `medicamentos.fecha_fin`).
--
-- `mediciones` acepta tipo 'otra', con el nombre y la unidad en la propia fila:
-- quitar el plan no borra lo medido.
--
-- RLS igual que `mediciones` (022): el dueño todo, un cuidador lee y uno con
-- rol 'editar' escribe.
--
-- Aplicar con `psql -1` ANTES de publicar y registrar en schema_migrations.
-- Sin ella las listas quedan vacías y guardar un plan avisa el error.

create table monitoreos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('presion', 'glucemia', 'peso', 'pulso', 'saturacion', 'temperatura', 'otra')),
  nombre_otra text check (nombre_otra is null or char_length(btrim(nombre_otra)) between 1 and 40),
  unidad_otra text check (unidad_otra is null or char_length(unidad_otra) <= 12),
  horarios jsonb not null check (jsonb_typeof(horarios) = 'array' and jsonb_array_length(horarios) between 1 and 4),
  dias_recurrentes text[] not null default '{}',
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoreos_otra check (
    case when tipo = 'otra' then nombre_otra is not null else nombre_otra is null and unidad_otra is null end
  )
);

create unique index idx_monitoreos_unico
  on monitoreos (usuario_id, tipo, lower(btrim(coalesce(nombre_otra, ''))));

alter table monitoreos enable row level security;

create policy monitoreos_all_self on monitoreos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy monitoreos_select_cuidador on monitoreos
  for select using (es_cuidador_de(usuario_id));
create policy monitoreos_insert_cuidador on monitoreos
  for insert with check (puede_editar_de(usuario_id));
create policy monitoreos_update_cuidador on monitoreos
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy monitoreos_delete_cuidador on monitoreos
  for delete using (puede_editar_de(usuario_id));

alter table mediciones drop constraint mediciones_tipo_check;
alter table mediciones
  add constraint mediciones_tipo_check
    check (tipo in ('presion', 'glucemia', 'peso', 'pulso', 'saturacion', 'temperatura', 'otra')),
  add column nombre_otra text check (nombre_otra is null or char_length(btrim(nombre_otra)) between 1 and 40),
  add column unidad_otra text check (unidad_otra is null or char_length(unidad_otra) <= 12),
  add constraint mediciones_otra check (
    case when tipo = 'otra'
      then nombre_otra is not null and abs(valor) <= 1000000
      else nombre_otra is null and unidad_otra is null
    end
  );
