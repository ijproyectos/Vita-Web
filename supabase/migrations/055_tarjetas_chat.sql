-- 055: las tarjetas de vita (remedios de hoy, turno agendado, "Tomada"…) quedan
-- guardadas con su mensaje, para seguir viéndose al reabrir el chat.
-- Son los mismos datos que vita ya escribió en esa conversación: heredan la RLS
-- del mensaje, se borran con él y la retención de 7 días las alcanza igual.
--
-- Aplicar con `psql -1` y registrar en schema_migrations. Sin ella el chat anda
-- igual y las tarjetas se ven solo en el momento.

alter table mensajes_chat add column if not exists tarjetas jsonb;
