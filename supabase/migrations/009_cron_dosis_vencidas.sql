-- Vitapp — Modo Cuidador: scheduler de detección de dosis vencidas.
--
-- ⚠️  NO aplicar esta migración con `supabase db push --linked` hasta que:
--   1. El route handler `/api/cron/dosis-vencidas` esté deployado en
--      producción (Netlify) y sea alcanzable en la URL de abajo.
--   2. `CRON_SECRET`, `RESEND_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` estén
--      cargadas en Netlify (mismo criterio que `ANTHROPIC_API_KEY` — ver
--      root CLAUDE.md, sección "Infra").
--   3. El placeholder `<CRON_SECRET_VALUE>` de abajo se haya reemplazado a
--      mano por el valor REAL de `CRON_SECRET` (debe ser idéntico al que
--      recibe la app en Netlify) — nunca commitear el valor real, editar
--      solo el archivo local antes de correr `db push`.
--
-- `pg_cron` agenda el job; `pg_net` hace el POST HTTP async hacia el route
-- handler (ambas extensiones son parte del stack administrado de Supabase,
-- no necesitan instalación aparte de crearlas). Rollback: `select
-- cron.unschedule('dosis-vencidas');`.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'dosis-vencidas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vitappweb.netlify.app/api/cron/dosis-vencidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{}'::jsonb
  );
  $$
);
