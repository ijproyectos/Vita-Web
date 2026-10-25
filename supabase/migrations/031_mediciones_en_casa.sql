-- Vitapp — Onboarding: "¿Te medís la presión o el azúcar en casa?" y
-- 'ayunas' como valor de medicamentos.con_comida (ver la última sección).
--
--   perfiles.mediciones_en_casa   'presion' | 'glucemia' | 'ambas' | 'ninguna'
--                                 (null = no respondió o salteó la pregunta)
--
-- Es un dato de salud del perfil (no son mediciones: esas viven en
-- `mediciones`, 022). Lo carga el onboarding conversacional para la propia
-- persona y para cada familiar a cargo. Hereda las policies de fila de
-- `perfiles` (dueño CRUD; cuidador lee y, con rol 'editar', actualiza — 021).
-- El trigger perfiles_proteger_columnas_ajenas (021) es una lista negra
-- (id, uso_app, onboarding_completado_at, avatar_url, created_at), así que
-- un Admin puede escribir esta columna en un perfil gestionado sin tocar el
-- trigger.
--
-- La columna es opcional: la app omite el guardado (sin error) mientras esta
-- migración no esté aplicada.
--
-- Esta migración está escrita pero NO aplicada todavía.

alter table perfiles
  add column if not exists mediciones_en_casa text
    check (mediciones_en_casa is null or mediciones_en_casa in ('presion', 'glucemia', 'ambas', 'ninguna'));

-- "En ayunas" como valor propio de la relación con la comida (el paso guiado de
-- remedios del onboarding lo ofrece; antes se guardaba como 'antes').
-- `medicamentos.con_comida` (004) y `medicamentos_pendientes.con_comida` (012)
-- tienen un check inline sin nombre propio: Postgres los nombra
-- <tabla>_<columna>_check. Mientras esta migración no esté aplicada, la app
-- reintenta con 'antes' si el insert rechaza 'ayunas'.
alter table medicamentos drop constraint if exists medicamentos_con_comida_check;
alter table medicamentos
  add constraint medicamentos_con_comida_check
  check (con_comida in ('ayunas', 'antes', 'con', 'despues', 'no-importa'));

alter table medicamentos_pendientes drop constraint if exists medicamentos_pendientes_con_comida_check;
alter table medicamentos_pendientes
  add constraint medicamentos_pendientes_con_comida_check
  check (con_comida in ('ayunas', 'antes', 'con', 'despues', 'no-importa'));
