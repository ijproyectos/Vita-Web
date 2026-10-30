-- Vitapp — Más espera para las llamadas HTTP de los jobs de pg_cron.
--
-- `net.http_post` espera 5 s por defecto (`timeout_milliseconds = 5000`). La ruta
-- `/api/cron/dosis-vencidas` a veces tarda más y el worker de `/api/cron/memoria`
-- tiene un presupuesto de 8 s, así que pg_net registraba "Timeout of 5000 ms
-- reached" aunque la función siguiera corriendo en Netlify. Se sube a 10 s, el
-- mismo tope que `maxDuration` de esas rutas.
--
-- Sin secretos en el archivo: se edita el comando ya guardado en `cron.job`
-- (agrega `timeout_milliseconds` después del `body`) con `cron.alter_job`.
-- Idempotente: un comando que ya tiene `timeout_milliseconds` no se toca.
-- Rollback: volver a correr la 018/041 (o quitar el parámetro a mano).

do $$
declare
  j record;
  v_nuevo text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'cron_timeout: pg_cron no está instalado; nada que hacer.';
    return;
  end if;

  for j in
    select jobid, jobname, command from cron.job where jobname in ('dosis-vencidas', 'memoria-resumen')
  loop
    if position('timeout_milliseconds' in j.command) > 0 then
      raise notice 'cron_timeout: % ya tiene timeout_milliseconds; no se toca.', j.jobname;
      continue;
    end if;

    v_nuevo := replace(j.command, 'body := ''{}''::jsonb', 'body := ''{}''::jsonb,' || chr(10) || '    timeout_milliseconds := 10000');
    if v_nuevo = j.command then
      raise notice 'cron_timeout: el comando de % no tiene la forma esperada; no se toca.', j.jobname;
      continue;
    end if;

    perform cron.alter_job(job_id := j.jobid, command := v_nuevo);
  end loop;
end;
$$;
