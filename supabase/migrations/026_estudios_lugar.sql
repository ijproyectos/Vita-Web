-- 026 — Lugar del estudio (V7 "Nuevo estudio": nombre / fecha / lugar).
-- Aditiva: una columna opcional. Sin aplicarla el estudio se guarda igual y
-- el campo "Lugar" no se muestra en el formulario.

alter table public.estudios
  add column if not exists lugar text;

comment on column public.estudios.lugar is 'Laboratorio o centro donde se hizo el estudio (texto libre, lo confirma el usuario al cargarlo).';
