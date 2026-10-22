-- Vitapp — "Monitoreo activo": mediciones de salud (presión, glucemia, peso,
-- pulso, saturación, temperatura).
--
-- Una fila = una medición puntual. La presión usa `valor` = sistólica y
-- `valor_secundario` = diastólica (+ `pulso` opcional); el resto usa solo
-- `valor`. `contexto` solo aplica a glucemia (ayunas / después de comer /
-- otro). Los rangos de los CHECK son de plausibilidad física (descartan
-- errores de tipeo), NO rangos clínicos de referencia.
--
-- RLS (mismo criterio que turnos/medicamentos en 021_familia.sql):
--   - el dueño tiene CRUD directo (`mediciones_all_self`);
--   - un cuidador con vínculo aceptado LEE (`es_cuidador_de`, cualquier rol);
--   - un cuidador con rol 'editar' escribe (`puede_editar_de`).
--
-- Esta migración está escrita pero NO aplicada todavía.

create table mediciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('presion', 'glucemia', 'peso', 'pulso', 'saturacion', 'temperatura')),
  valor numeric not null,
  valor_secundario numeric,
  pulso numeric,
  contexto text,
  medido_at timestamptz not null default now(),
  notas text check (notas is null or char_length(notas) <= 500),
  created_at timestamptz not null default now(),

  -- Plausibilidad por tipo.
  constraint mediciones_valor_rango check (
    case tipo
      when 'presion' then valor between 40 and 300
      when 'glucemia' then valor between 10 and 1000
      when 'peso' then valor between 1 and 500
      when 'pulso' then valor between 20 and 300
      when 'saturacion' then valor between 50 and 100
      when 'temperatura' then valor between 30 and 45
    end
  ),
  -- Diastólica: obligatoria y menor que la sistólica en presión; prohibida en el resto.
  constraint mediciones_diastolica check (
    case tipo
      when 'presion' then valor_secundario is not null and valor_secundario between 20 and 200 and valor_secundario < valor
      else valor_secundario is null
    end
  ),
  -- Pulso asociado: solo en presión, opcional.
  constraint mediciones_pulso_asociado check (
    pulso is null or (tipo = 'presion' and pulso between 20 and 300)
  ),
  -- Contexto: solo en glucemia, opcional.
  constraint mediciones_contexto check (
    contexto is null or (tipo = 'glucemia' and contexto in ('ayunas', 'despues_comer', 'otro'))
  )
);

create index idx_mediciones_usuario_tipo_fecha on mediciones (usuario_id, tipo, medido_at desc);

-- RLS ----------------------------------------------------------------------

alter table mediciones enable row level security;

create policy mediciones_all_self on mediciones
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy mediciones_select_cuidador on mediciones
  for select using (es_cuidador_de(usuario_id));
create policy mediciones_insert_cuidador on mediciones
  for insert with check (puede_editar_de(usuario_id));
create policy mediciones_update_cuidador on mediciones
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
create policy mediciones_delete_cuidador on mediciones
  for delete using (puede_editar_de(usuario_id));
