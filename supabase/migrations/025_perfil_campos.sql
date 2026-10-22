-- Vitapp — Perfil V7: campos de "Editar perfil" y "Contacto de emergencia".
--
--   perfiles.apellido                       "Apellido" de Editar perfil
--   perfiles.telefono                       "Teléfono" de Editar perfil
--   perfiles.contacto_emergencia_relacion   "Es tu…" (Hermana, Pareja, Mamá…)
--
-- Las tres columnas son opcionales: la app oculta los inputs (y no los manda
-- al guardar) mientras esta migración no esté aplicada. Heredan las policies
-- de fila de `perfiles` (dueño CRUD; cuidador lee y, con rol 'editar',
-- actualiza — 021). El trigger perfiles_proteger_columnas_ajenas no las
-- restringe: son datos de salud/contacto, no estado de la cuenta.
--
-- Esta migración está escrita pero NO aplicada todavía.

alter table perfiles
  add column if not exists apellido text
    check (apellido is null or char_length(apellido) <= 80),
  add column if not exists telefono text
    check (telefono is null or char_length(telefono) <= 40),
  add column if not exists contacto_emergencia_relacion text
    check (contacto_emergencia_relacion is null or char_length(contacto_emergencia_relacion) <= 40);
