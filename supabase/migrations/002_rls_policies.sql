-- Vitapp — RLS policies
-- Single-tenant por usuario: toda tabla se filtra por auth.uid() directo,
-- sin necesidad de resolver un "tenant" intermedio como en NutrIA.

alter table perfiles enable row level security;
alter table medicamentos enable row level security;
alter table medicamentos_tomas enable row level security;

-- perfiles: cada usuario solo ve/edita su propia fila.
create policy perfiles_select_self on perfiles
  for select using (id = auth.uid());

create policy perfiles_upsert_self on perfiles
  for insert with check (id = auth.uid());

create policy perfiles_update_self on perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- medicamentos: CRUD completo, siempre scoped a usuario_id = auth.uid().
create policy medicamentos_all_self on medicamentos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- medicamentos_tomas: CRUD completo, siempre scoped a usuario_id = auth.uid().
create policy medicamentos_tomas_all_self on medicamentos_tomas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
