-- Vitapp — límite diario de uso de IA por usuario (chat con vita,
-- extracción de estudios, extracción de onboarding conversacional) — para
-- que una sola cuenta no pueda agotar el crédito de Anthropic de todo el
-- proyecto en un día.
--
-- Sin RLS habilitada para ningún rol normal: esto es contabilidad de
-- sistema, no datos del usuario. Si un usuario pudiera escribir su propia
-- fila (aunque fuera solo la suya, `usuario_id = auth.uid()`), podría
-- resetear su propio contador a mano vía la API REST y saltarse el
-- límite por completo — mismo motivo por el que `alertas_dosis`
-- (008_cuidadores.sql) tampoco tiene policies propias. Se lee/escribe
-- siempre desde el cliente `service_role` (lib/supabase/admin.ts, ya
-- existe), nunca desde la sesión del usuario.

create table uso_ia_diario (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null,
  tokens_input bigint not null default 0,
  tokens_output bigint not null default 0,
  llamadas int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, fecha)
);

alter table uso_ia_diario enable row level security;
-- Deliberadamente sin ninguna policy — RLS habilitada + 0 policies = nadie
-- (ni siquiera el dueño) puede leer/escribir esta tabla desde una sesión
-- normal, solo `service_role` (que bypassa RLS por diseño).
