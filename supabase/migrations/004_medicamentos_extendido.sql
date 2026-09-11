-- Vitapp — extiende medicamentos para el form real del diseño vita.ia
-- (AgregarMedicamentoScreen.jsx: dosis+unidad, frecuencia descriptiva,
-- con qué comida, duración, notas). Aditiva, no rompe adherencia ni tools.

alter table medicamentos
  add column unidad text not null default 'mg',
  add column frecuencia text, -- descriptiva ("1 vez al día"...), no gobierna el scheduling real
  add column con_comida text check (con_comida in ('antes', 'con', 'despues', 'no-importa')) default 'no-importa',
  add column duracion text, -- label libre ("7 días" / "Indefinido"...)
  add column notas text;

-- El diseño agrega un 4to momento del día ("Tarde") que no existía.
alter table medicamentos drop constraint medicamentos_momento_dia_check;
alter table medicamentos add constraint medicamentos_momento_dia_check
  check (momento_dia in ('mañana', 'mediodia', 'tarde', 'noche'));
