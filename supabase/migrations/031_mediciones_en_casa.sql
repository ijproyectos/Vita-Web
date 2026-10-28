-- Vitapp — Onboarding sin pérdidas: dos columnas nuevas.
--
--   perfiles.mediciones_en_casa   'presion' | 'glucemia' | 'ambas' | 'ninguna'
--                                 (null = no respondió o salteó la pregunta)
--   medicamentos.indicacion       clave del catálogo de indicaciones de comida
--                                 (lib/medicamentos/comidas.ts); null = sin indicación
--
-- 1) "¿Te medís la presión o el azúcar en casa?"
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
-- 2) Indicación de comida de cada toma. Es solo una observación ("Con el
-- desayuno"): la hora (`hora_programada`) manda para recordatorios y orden, y
-- la clave se guarda exactamente como se eligió, sin re-deducirla de la hora.
-- `con_comida` sigue escrita (derivada de la clave) para los lectores viejos:
-- antes-* y ayunas -> 'antes', con-* -> 'con', despues-* -> 'despues'. Las filas
-- anteriores quedan con indicacion null y se muestran por `con_comida`.
-- La app degrada si la columna no existe: reintenta el insert/update sin ella.
-- `medicamentos_pendientes` (borradores viejos) no la lleva.
--
-- Esta migración está escrita pero NO aplicada todavía.

alter table perfiles
  add column if not exists mediciones_en_casa text
    check (mediciones_en_casa is null or mediciones_en_casa in ('presion', 'glucemia', 'ambas', 'ninguna'));

alter table medicamentos
  add column if not exists indicacion text
    check (indicacion is null or indicacion in (
      'ayunas',
      'antes-desayuno', 'con-desayuno', 'despues-desayuno',
      'antes-almuerzo', 'con-almuerzo', 'despues-almuerzo',
      'antes-merienda', 'con-merienda', 'despues-merienda',
      'antes-cena', 'con-cena', 'despues-cena',
      'antes-dormir'
    ));
