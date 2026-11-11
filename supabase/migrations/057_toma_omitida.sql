-- 057: "No la tomé" del modo simple.
-- Una dosis que la persona dice que hoy NO toma queda como fila de
-- medicamentos_tomas con tomado = false y omitida_at = cuándo lo dijo.
-- Así el modo simple deja de pedirla, el aviso del celular y la alerta al
-- cuidador dejan de insistir, y el resumen de la noche al cuidador lo cuenta
-- ("Dijo que no tomó…"). La adherencia no cambia: sigue sin estar tomada.
-- Las RLS existentes de medicamentos_tomas (dueño y cuidador con rol editar)
-- ya cubren la columna nueva. El código degrada sin esta migración (las
-- lecturas de omitida_at fallan en silencio y "No la tomé" avisa que no pudo).

alter table public.medicamentos_tomas
  add column if not exists omitida_at timestamptz;

comment on column public.medicamentos_tomas.omitida_at is
  'Cuándo la persona dijo "No la tomé" (solo con tomado = false). Null = no se dijo nada.';
