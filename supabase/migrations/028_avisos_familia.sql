-- Vitapp — V7 paquete 8: Avisos con familia.
--
-- Escrita pero NO aplicada. Requisitos previos: 020 (avisos, preferencias_avisos,
-- envios_avisos) y 021 (vinculos_cuidador.rol).
--
-- 1. avisos.persona_id: a qué persona cuidada se refiere un aviso del feed de
--    UN CUIDADOR ("Elsa no confirmó su Glucophage"). Null = aviso propio. Sirve
--    para el filtro Todos / {Persona} / Vos y los grupos por persona de
--    /app/avisos. La fila sigue siendo del cuidador (usuario_id = cuidador): la
--    RLS no cambia, nadie ve avisos ajenos. on delete cascade: si la persona
--    deja de existir, los avisos sobre ella no tienen a qué apuntar.
-- 2. preferencias_avisos: preferencias del CUIDADOR para el bloque
--    "Avisos de {persona}" de Configurar avisos. Son por cuidador (no por
--    persona): una granularidad por persona pediría otra tabla y no la pide el
--    diseño.
--      pendiente_persona  avisarme si no confirma una toma (la alerta de siempre)
--      resumen_dia        resumen de las 21:00 ("Elsa tomó 4 de 5 hoy")
--      stock_persona      remedio por terminarse (solo a cuidadores Admin)
--      turnos_persona     turno de la persona mañana (default false, como el diseño)
--    La espera antes de avisar al cuidador NO cambia: sigue siendo
--    espera_cuidador_min de la PERSONA (un Admin ya puede editarla por la
--    policy preferencias_avisos_update_cuidador de la 021).
-- 3. envios_avisos.tipo es text libre (sin check): los tipos nuevos
--    (resumen_dia_persona, turno_persona_dia_antes, stock_bajo_persona,
--    persona_en_vita) no necesitan cambios. Como la unique es (tipo, ref_id,
--    fecha) y estos avisos son POR CUIDADOR, el código usa como ref_id un uuid
--    determinista derivado de (persona, cuidador[, turno/inventario]).
--
-- Sin esta migración la app degrada: el feed y las preferencias siguen
-- funcionando como en la 020 y los avisos nuevos de familia quedan apagados.

alter table avisos
  add column if not exists persona_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_avisos_persona
  on avisos (usuario_id, persona_id, created_at desc);

alter table preferencias_avisos
  add column if not exists pendiente_persona boolean not null default true,
  add column if not exists resumen_dia boolean not null default true,
  add column if not exists stock_persona boolean not null default true,
  add column if not exists turnos_persona boolean not null default false;
