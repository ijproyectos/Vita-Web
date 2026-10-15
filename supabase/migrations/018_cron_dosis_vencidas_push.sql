-- Vitapp — Scheduler de la alerta de dosis vencida (ahora por Web Push).
--
-- NO aplicar tal cual: el placeholder `<CRON_SECRET_VALUE>` se reemplaza a
-- mano, solo en el archivo local, por el valor REAL de CRON_SECRET (el mismo
-- que tiene Netlify) justo antes de aplicar. Nunca commitear el valor real.
-- Requisitos previos: migracion 017 aplicada, el route deployado, y
-- NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT /
-- CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY cargadas en Netlify.
--
-- La 009 (mismo job, pensado para email) esta registrada pero cron.job estaba
-- vacio; esta migracion reemplaza el job si existiera. Rollback:
--   select cron.unschedule('dosis-vencidas');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dosis-vencidas') then
    perform cron.unschedule('dosis-vencidas');
  end if;
end;
$$;

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
