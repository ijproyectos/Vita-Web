-- Vitapp — velocidad real (Web Vitals anónimos) e índices de rendimiento.
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
--
-- 1) `web_vitals`: una fila por métrica medida en el navegador (LCP, INP, CLS, FCP, TTFB). ANÓNIMA: sin usuario, sin IP,
--    sin user agent. Solo la ruta normalizada (sin ids ni query: `/app/familia/[id]`), la métrica, el valor, la
--    calificación, el tipo de navegación y una clase de dispositivo gruesa (mobile / desktop). La escribe `POST
--    /api/vitals` con service_role (uso sancionado, ver lib/supabase/admin.ts) detrás de un freno por IP hasheada.
--    RLS activada y SIN policies: nadie con sesión la lee ni la escribe. Retención de 30 días en el cron
--    `dosis-vencidas` (lib/notificaciones/retencion.ts); sin job nuevo.
-- 2) `admin_web_vitals(p_dias)`: p75 por métrica y las 5 rutas más lentas por LCP, para /adminvita/sistema.
--    SECURITY DEFINER con search_path vacío, solo service_role (el servidor la llama tras `requireAdmin()`).
-- 3) Tres índices verificados como faltantes en producción (vínculos aceptados del cuidador, tomas por usuario y fecha,
--    mensajes de chat por usuario y fecha).
--
-- Convenciones del repo: `returns table` con columnas prefijadas (o_), idempotente (if not exists / create or replace).
-- Rollback:
--   drop function if exists public.admin_web_vitals(int);
--   drop table if exists public.web_vitals;
--   drop index if exists public.idx_vinculos_cuidador_elder_aceptado;
--   drop index if exists public.idx_medicamentos_tomas_usuario_fecha;
--   drop index if exists public.idx_mensajes_chat_usuario_creado;

-- Medición anónima ---------------------------------------------------------------------------------------

create table if not exists public.web_vitals (
  id bigint generated always as identity primary key,
  ruta text not null check (char_length(ruta) between 1 and 120),
  metrica text not null check (metrica in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  valor double precision not null check (valor >= 0 and valor <= 600000),
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  tipo_navegacion text check (tipo_navegacion in ('navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore')),
  dispositivo text not null check (dispositivo in ('mobile', 'desktop')),
  created_at timestamptz not null default now()
);

create index if not exists idx_web_vitals_created_at on public.web_vitals (created_at desc);
create index if not exists idx_web_vitals_metrica_ruta on public.web_vitals (metrica, ruta, created_at desc);

alter table public.web_vitals enable row level security;
-- Deliberadamente sin policies: solo service_role (bypassa RLS).
revoke all on table public.web_vitals from public, anon, authenticated;
grant select, insert, delete on table public.web_vitals to service_role;

-- Lectura para el panel ------------------------------------------------------------------------------------

create or replace function public.admin_web_vitals(p_dias int default 7)
returns table (o_seccion text, o_datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30)));
  v_metricas jsonb;
  v_rutas jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'metrica', x.metrica, 'p75', x.p75, 'n', x.n, 'buenos_pct', x.buenos_pct
         ) order by x.orden), '[]'::jsonb)
    into v_metricas
  from (
    select w.metrica,
           array_position(array['LCP', 'INP', 'CLS', 'FCP', 'TTFB'], w.metrica) as orden,
           percentile_cont(0.75) within group (order by w.valor) as p75,
           count(*) as n,
           round(100.0 * count(*) filter (where w.rating = 'good') / count(*), 1) as buenos_pct
    from public.web_vitals w
    where w.created_at >= v_desde
    group by w.metrica
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('ruta', r.ruta, 'p75_lcp', r.p75, 'n', r.n) order by r.p75 desc), '[]'::jsonb)
    into v_rutas
  from (
    select w.ruta,
           percentile_cont(0.75) within group (order by w.valor) as p75,
           count(*) as n
    from public.web_vitals w
    where w.created_at >= v_desde and w.metrica = 'LCP'
    group by w.ruta
    having count(*) >= 3
    order by percentile_cont(0.75) within group (order by w.valor) desc
    limit 5
  ) r;

  return query values ('metricas'::text, v_metricas), ('rutas_lentas'::text, v_rutas);
end;
$$;

revoke all on function public.admin_web_vitals(int) from public, anon, authenticated;
grant execute on function public.admin_web_vitals(int) to service_role;

-- Índices de rendimiento ----------------------------------------------------------------------------------

create index if not exists idx_vinculos_cuidador_elder_aceptado
  on public.vinculos_cuidador (cuidador_id, elder_id) where estado = 'aceptado';

create index if not exists idx_medicamentos_tomas_usuario_fecha
  on public.medicamentos_tomas (usuario_id, fecha);

create index if not exists idx_mensajes_chat_usuario_creado
  on public.mensajes_chat (usuario_id, created_at desc);
