-- Vitapp — "vita proactiva", etapa 1: observaciones por reglas (sin IA).
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- Requiere 020 (avisos, preferencias_avisos, envios_avisos), 021 (es_cuidador_de / puede_editar_de) y el job
-- `dosis-vencidas` (018) si se quiere agendar el cron.
--
-- Qué agrega:
--   1. observaciones: una fila por cosa que vita nota en los datos de una persona (stock por terminarse, tomas
--      salteadas, presión o glucemia fuera de lo esperado, estudios con valores marcados, turnos cerca, tratamientos
--      por terminar, mediciones pendientes, familia sin tomas). El texto sale de plantillas de la app con números y
--      nombres que ya están en los datos de la persona: ningún texto libre de nadie más.
--      `usuario_id` = la persona dueña de los datos. `clave` es la clave de dedupe (tipo + referencia + semana):
--      unique (usuario_id, clave), así el cron puede correr las veces que haga falta.
--   2. RLS:
--      - el dueño lee lo suyo (salvo `familia_sin_tomas`, que es un aviso PARA quien cuida) y solo puede cambiar
--        `vista_at` y `descartada_at` (grant por columna) y borrar lo suyo (Borrar historial);
--      - un cuidador aceptado lee lo de la persona (cualquier rol: el inicio "solo mirar" también muestra la
--        tarjeta); `familia_sin_tomas` solo la lee quien tiene rol 'editar';
--      - un cuidador con rol 'editar' puede marcar vista/descartada; uno 'ver' nunca escribe;
--      - nadie inserta desde la app: solo service_role (cron).
--   3. preferencias_avisos.observaciones (default true): el interruptor "Observaciones de vita".
--   4. Scheduler: UN job pg_cron `observaciones`, cada 15 minutos entre las 11:00 y las 13:59 UTC (08:00 a 10:59 AR),
--      derivado del job `dosis-vencidas` (sin secretos). Si ese job o pg_cron no existen, no hace nada.
--
-- Rollback: select cron.unschedule('observaciones'); drop table observaciones;
--           alter table preferencias_avisos drop column observaciones;

create table observaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in (
    'stock_bajo_dias',
    'tomas_salteadas',
    'presion_alta',
    'glucemia_fuera_rango',
    'estudio_fuera_rango',
    'turno_cerca',
    'tratamiento_termina',
    'medicion_pendiente',
    'familia_sin_tomas'
  )),
  severidad text not null check (severidad in ('info', 'atencion')),
  clave text not null check (char_length(clave) between 1 and 200),
  titulo text not null check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 500),
  datos jsonb not null default '{}'::jsonb,
  href text check (href is null or href ~ '^/app(/|$)'),
  creada_at timestamptz not null default now(),
  vigente_hasta timestamptz not null,
  vista_at timestamptz,
  descartada_at timestamptz,
  unique (usuario_id, clave)
);

create index idx_observaciones_usuario on observaciones (usuario_id, vigente_hasta desc);
create index idx_observaciones_vigencia on observaciones (vigente_hasta);

alter table observaciones enable row level security;

create policy observaciones_select_self on observaciones
  for select using (usuario_id = auth.uid() and tipo <> 'familia_sin_tomas');

create policy observaciones_select_cuidador on observaciones
  for select using (
    es_cuidador_de(usuario_id)
    and (tipo <> 'familia_sin_tomas' or puede_editar_de(usuario_id))
  );

create policy observaciones_update_self on observaciones
  for update
  using (usuario_id = auth.uid() and tipo <> 'familia_sin_tomas')
  with check (usuario_id = auth.uid() and tipo <> 'familia_sin_tomas');

create policy observaciones_update_cuidador on observaciones
  for update
  using (puede_editar_de(usuario_id))
  with check (puede_editar_de(usuario_id));

create policy observaciones_delete_self on observaciones
  for delete using (usuario_id = auth.uid() and tipo <> 'familia_sin_tomas');

-- RLS es de fila, no de columna: lo único que la app puede tocar es vista_at / descartada_at (y borrar lo propio).
revoke all on observaciones from anon;
revoke insert, update on observaciones from authenticated;
grant select, delete on observaciones to authenticated;
grant update (vista_at, descartada_at) on observaciones to authenticated;

-- Interruptor "Observaciones de vita" (Configurar avisos).
alter table preferencias_avisos
  add column if not exists observaciones boolean not null default true;

-- ---------------------------------------------------------------------------
-- Scheduler: Supabase Cron (pg_cron + pg_net), llama a /api/cron/observaciones.
-- SIN secretos en este archivo: el comando se deriva del job `dosis-vencidas` (migración 018), que ya trae la URL y el
-- header `x-cron-secret` reales; solo se cambia el path. Cada 15 minutos entre las 11:00 y las 13:59 UTC (08:00 a
-- 10:59 AR): el endpoint procesa a las personas por lotes con un cursor, así que si un tick no alcanza a terminar,
-- sigue en el siguiente. Si ese job no existe o pg_cron no está, no hace nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_base text;
  v_comando text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'observaciones: pg_cron no está instalado; no se agenda el job.';
    return;
  end if;

  execute 'select command from cron.job where jobname = $1' into v_base using 'dosis-vencidas';
  if v_base is null then
    raise notice 'observaciones: no existe el job dosis-vencidas (migración 018); no se agenda el job.';
    return;
  end if;

  v_comando := replace(v_base, '/api/cron/dosis-vencidas', '/api/cron/observaciones');
  if v_comando = v_base then
    raise notice 'observaciones: el comando de dosis-vencidas no contiene la ruta esperada; no se agenda el job.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'observaciones') then
    perform cron.unschedule('observaciones');
  end if;
  perform cron.schedule('observaciones', '*/15 11-13 * * *', v_comando);
end;
$$;
