-- Vitapp — Onboarding: "¿Te medís la presión o el azúcar en casa?".
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
