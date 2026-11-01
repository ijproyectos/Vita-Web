-- Vitapp — panel de administración (/adminvita), solo lectura.
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- Requiere las migraciones 013, 021, 034, 036, 038 y 044 (el bloque de abajo corta si falta algo).
--
-- Decisión del dueño (2026-11-01): un panel para los 3 administradores que muestra rápido qué pasa del lado del
-- servicio. PRIVACIDAD: ninguna función devuelve texto escrito por usuarios (mensajes de chat, texto de recuerdos,
-- datos de salud, nombres de medicamentos, contenido de estudios, notas). Solo datos de cuenta (email, nombre),
-- conteos, fechas, costos, estados y salud del sistema.
--
--   * admin_accesos: auditoría de cada vista del panel. RLS activada y SIN policies: solo service_role.
--   * admin_resumen / admin_usuarios / admin_usuario / admin_ia / admin_vita_plus / admin_sistema: funciones
--     SECURITY DEFINER con search_path vacío, ejecutables SOLO por service_role. El servidor las llama con el cliente
--     admin DESPUÉS de validar con la sesión que quien pide está en la lista ADMIN_EMAILS (lib/admin/acceso.ts).
--   * Ayudantes internos: admin_tipo_cuenta (inmutable) y admin_actividad (última actividad por cuenta).
--
-- "Actividad" de una cuenta = el máximo entre su último inicio de sesión, la última sesión de chat tocada, la última
-- respuesta de vita registrada, la última toma marcada y la última medición.
-- Convenciones del repo: `returns table` con columnas prefijadas (o_), idempotente (create or replace / if not exists).
-- Rollback:
--   drop function if exists public.admin_sistema(), public.admin_vita_plus(), public.admin_ia(int),
--     public.admin_usuario(uuid), public.admin_usuarios(text, text, int, int), public.admin_resumen(),
--     public.admin_actividad(), public.admin_tipo_cuenta(jsonb, jsonb, text);
--   drop table if exists public.admin_accesos;

do $$
declare
  v_falta text;
begin
  select string_agg(t, ', ') into v_falta
  from unnest(array[
    'public.perfiles', 'public.medicamentos', 'public.medicamentos_tomas', 'public.turnos', 'public.mediciones',
    'public.estudios', 'public.consultas', 'public.vacunas', 'public.sesiones_chat', 'public.mensajes_chat',
    'public.vinculos_cuidador', 'public.uso_ia_diario', 'public.registros_chat', 'public.memorias',
    'public.push_suscripciones', 'public.vita_plus_suscripciones', 'public.vita_plus_pagos',
    'public.vita_plus_vigencia', 'public.vita_plus_pagos_no_acreditados', 'public.vita_plus_arrepentimientos'
  ]) as t
  where to_regclass(t) is null;
  if v_falta is not null then
    raise exception 'admin_panel: faltan tablas (aplicar antes las migraciones previas): %', v_falta;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'uso_ia_diario' and column_name = 'costo_micro_usd'
  ) then
    raise exception 'admin_panel: falta uso_ia_diario.costo_micro_usd (migración 036)';
  end if;
end;
$$;

-- Auditoría -------------------------------------------------------------------------------------------

create table if not exists public.admin_accesos (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  ruta text not null check (char_length(ruta) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_accesos_created_at on public.admin_accesos (created_at desc);

alter table public.admin_accesos enable row level security;
-- Deliberadamente sin policies: solo service_role (bypassa RLS).
revoke all on table public.admin_accesos from public, anon, authenticated;
grant select, insert on table public.admin_accesos to service_role;

-- Ayudantes -------------------------------------------------------------------------------------------

-- 'real' | 'gestionado' | 'por_codigo'. La marca de confianza es app_metadata; user_metadata (que el cliente puede
-- reescribir) y el dominio placeholder del email solo sirven de respaldo para cuentas viejas.
create or replace function public.admin_tipo_cuenta(p_app jsonb, p_user jsonb, p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_app ->> 'tipo', p_user ->> 'tipo') = 'perfil_gestionado' then 'gestionado'
    when coalesce(p_app ->> 'tipo', p_user ->> 'tipo') = 'cuenta_por_codigo' then 'por_codigo'
    when coalesce(p_email, '') like 'gestionado-%@usuarios.soyvita.com.ar' then 'gestionado'
    when coalesce(p_email, '') like 'cuidado-%@usuarios.soyvita.com.ar' then 'por_codigo'
    else 'real'
  end;
$$;

create or replace function public.admin_actividad()
returns table (o_usuario_id uuid, o_ultima timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, greatest(u.last_sign_in_at, s.ult, r.ult, t.ult, m.ult)
  from auth.users u
  left join (select x.usuario_id, max(x.updated_at) as ult from public.sesiones_chat x group by x.usuario_id) s
    on s.usuario_id = u.id
  left join (select x.usuario_id, max(x.created_at) as ult from public.registros_chat x group by x.usuario_id) r
    on r.usuario_id = u.id
  left join (select x.usuario_id, max(x.tomado_en) as ult from public.medicamentos_tomas x where x.tomado group by x.usuario_id) t
    on t.usuario_id = u.id
  left join (select x.usuario_id, max(x.created_at) as ult from public.mediciones x group by x.usuario_id) m
    on m.usuario_id = u.id
  where u.deleted_at is null;
$$;

-- Resumen ---------------------------------------------------------------------------------------------

create or replace function public.admin_resumen()
returns table (
  o_usuarios_total bigint,
  o_gestionados bigint,
  o_nuevos_7d bigint,
  o_nuevos_30d bigint,
  o_activos_hoy bigint,
  o_activos_7d bigint,
  o_activos_30d bigint,
  o_vita_plus_activos bigint,
  o_onboarding_pct numeric,
  o_costo_hoy_usd numeric,
  o_costo_mes_usd numeric,
  o_mensajes_hoy bigint,
  o_pagos_no_acreditados_30d bigint,
  o_arrepentimientos bigint,
  o_cron_fallos_24h bigint,
  o_http_fallos_24h bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_inicio_hoy timestamptz := ((now() at time zone 'America/Argentina/Buenos_Aires')::date)::timestamp
    at time zone 'America/Argentina/Buenos_Aires';
  v_mes date := date_trunc('month', ((now() at time zone 'America/Argentina/Buenos_Aires')::date)::timestamp)::date;
  v_cron bigint := 0;
  v_http bigint := 0;
begin
  if to_regclass('cron.job_run_details') is not null then
    execute $q$select count(*) from cron.job_run_details d
               where d.status = 'failed' and d.start_time > now() - interval '24 hours'$q$ into v_cron;
  end if;
  if to_regclass('net._http_response') is not null then
    execute $q$select count(*) from net._http_response h
               where h.created > now() - interval '24 hours'
                 and (h.timed_out is true or h.status_code is null or h.status_code >= 400)$q$ into v_http;
  end if;

  return query
  with cuentas as (
    select u.id, u.created_at,
           public.admin_tipo_cuenta(u.raw_app_meta_data, u.raw_user_meta_data, u.email::text) as tipo,
           a.o_ultima as ultima,
           (p.onboarding_completado_at is not null) as onb
    from auth.users u
    left join public.admin_actividad() a on a.o_usuario_id = u.id
    left join public.perfiles p on p.id = u.id
    where u.deleted_at is null
  )
  select
    (select count(*) from cuentas),
    (select count(*) from cuentas c where c.tipo = 'gestionado'),
    (select count(*) from cuentas c where c.created_at > now() - interval '7 days'),
    (select count(*) from cuentas c where c.created_at > now() - interval '30 days'),
    (select count(*) from cuentas c where c.ultima >= v_inicio_hoy),
    (select count(*) from cuentas c where c.ultima > now() - interval '7 days'),
    (select count(*) from cuentas c where c.ultima > now() - interval '30 days'),
    (select count(*) from public.vita_plus_vigencia v where v.vence_at > now()),
    (select round(100.0 * count(*) filter (where c.onb) / nullif(count(*), 0), 1)
       from cuentas c where c.tipo <> 'gestionado'),
    (select round(coalesce(sum(x.costo_micro_usd), 0) / 1000000.0, 4) from public.uso_ia_diario x where x.fecha = v_hoy),
    (select round(coalesce(sum(x.costo_micro_usd), 0) / 1000000.0, 4) from public.uso_ia_diario x where x.fecha >= v_mes),
    (select count(*) from public.registros_chat r where r.created_at >= v_inicio_hoy),
    (select count(*) from public.vita_plus_pagos_no_acreditados n where n.creado_at > now() - interval '30 days'),
    (select count(*) from public.vita_plus_arrepentimientos),
    v_cron,
    v_http;
end;
$$;

-- Usuarios --------------------------------------------------------------------------------------------

create or replace function public.admin_usuarios(
  p_busqueda text default '',
  p_filtro text default 'todos',
  p_limite int default 25,
  p_offset int default 0
)
returns table (
  o_total bigint,
  o_id uuid,
  o_email text,
  o_nombre text,
  o_creado timestamptz,
  o_ultimo_login timestamptz,
  o_ultima_actividad timestamptz,
  o_dias_inactivo int,
  o_vita_plus boolean,
  o_vence timestamptz,
  o_plan text,
  o_tipo text,
  o_personas_cuida int,
  o_cuidadores int,
  o_costo_30d_usd numeric,
  o_tokens_30d bigint,
  o_onboarding boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_q text := lower(btrim(coalesce(p_busqueda, '')));
  v_filtro text := case when p_filtro in ('vita_plus', 'inactivos_7', 'inactivos_30', 'gestionados', 'sin_onboarding')
                        then p_filtro else 'todos' end;
  v_limite int := least(greatest(coalesce(p_limite, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  with base as (
    select u.id, u.email::text as email, p.nombre, u.created_at, u.last_sign_in_at,
           public.admin_tipo_cuenta(u.raw_app_meta_data, u.raw_user_meta_data, u.email::text) as tipo,
           a.o_ultima as ultima,
           (p.onboarding_completado_at is not null) as onb,
           vg.vence_at,
           case when a.o_ultima is null then null
                else (v_hoy - (a.o_ultima at time zone 'America/Argentina/Buenos_Aires')::date) end as dias
    from auth.users u
    left join public.perfiles p on p.id = u.id
    left join public.admin_actividad() a on a.o_usuario_id = u.id
    left join public.vita_plus_vigencia vg on vg.usuario_id = u.id
    where u.deleted_at is null
  ),
  filtrado as (
    select b.*, count(*) over () as total
    from base b
    where (v_q = ''
           or position(v_q in lower(coalesce(b.email, ''))) > 0
           or position(v_q in lower(coalesce(b.nombre, ''))) > 0
           or position(v_q in b.id::text) > 0)
      and case v_filtro
            when 'vita_plus' then coalesce(b.vence_at > now(), false)
            when 'inactivos_7' then b.dias is null or b.dias >= 7
            when 'inactivos_30' then b.dias is null or b.dias >= 30
            when 'gestionados' then b.tipo = 'gestionado'
            when 'sin_onboarding' then not b.onb
            else true
          end
    order by b.ultima desc nulls last, b.created_at desc
    limit v_limite offset v_offset
  )
  select
    f.total,
    f.id,
    f.email,
    f.nombre,
    f.created_at,
    f.last_sign_in_at,
    f.ultima,
    f.dias::int,
    coalesce(f.vence_at > now(), false),
    f.vence_at,
    (select s.plan from public.vita_plus_suscripciones s
      where s.usuario_id = f.id and s.preapproval_id is not null
      order by case s.estado when 'authorized' then 3 when 'paused' then 2 when 'pending' then 1 else 0 end desc,
               s.creada_at desc
      limit 1),
    f.tipo,
    (select count(*)::int from public.vinculos_cuidador v where v.cuidador_id = f.id and v.estado = 'aceptado'),
    (select count(*)::int from public.vinculos_cuidador v where v.elder_id = f.id and v.estado = 'aceptado'),
    (select round(coalesce(sum(x.costo_micro_usd), 0) / 1000000.0, 4) from public.uso_ia_diario x
      where x.usuario_id = f.id and x.fecha > v_hoy - 30),
    (select coalesce(sum(x.tokens_input + x.tokens_output), 0)::bigint from public.uso_ia_diario x
      where x.usuario_id = f.id and x.fecha > v_hoy - 30),
    f.onb
  from filtrado f
  order by f.ultima desc nulls last, f.created_at desc;
end;
$$;

-- Detalle de un usuario -------------------------------------------------------------------------------
-- Secciones (o_seccion, o_datos jsonb): cuenta, uso_diario, conteos, cuidadores, cuida_a, suscripciones, pagos.
-- Los conteos son SOLO números; de los vínculos se devuelve el nombre de la cuenta, nunca contenido de salud.

create or replace function public.admin_usuario(p_id uuid)
returns table (o_seccion text, o_datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_ultima timestamptz;
begin
  if not exists (select 1 from auth.users u where u.id = p_id and u.deleted_at is null) then
    return;
  end if;

  select a.o_ultima into v_ultima from public.admin_actividad() a where a.o_usuario_id = p_id;

  return query
  select 'cuenta'::text, jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'nombre', p.nombre,
    'creado', u.created_at,
    'ultimo_login', u.last_sign_in_at,
    'email_confirmado', u.email_confirmed_at is not null,
    'ultima_actividad', v_ultima,
    'dias_inactivo', case when v_ultima is null then null
                          else v_hoy - (v_ultima at time zone 'America/Argentina/Buenos_Aires')::date end,
    'tipo', public.admin_tipo_cuenta(u.raw_app_meta_data, u.raw_user_meta_data, u.email::text),
    'onboarding', p.onboarding_completado_at is not null,
    'memoria_activa', p.memoria_activa,
    'vita_plus', coalesce(vg.vence_at > now(), false),
    'vence', vg.vence_at,
    'plan', (select s.plan from public.vita_plus_suscripciones s
              where s.usuario_id = u.id and s.preapproval_id is not null
              order by case s.estado when 'authorized' then 3 when 'paused' then 2 when 'pending' then 1 else 0 end desc,
                       s.creada_at desc limit 1)
  )
  from auth.users u
  left join public.perfiles p on p.id = u.id
  left join public.vita_plus_vigencia vg on vg.usuario_id = u.id
  where u.id = p_id;

  return query
  select 'uso_diario'::text, coalesce(jsonb_agg(jsonb_build_object(
    'fecha', d.dia,
    'tokens_input', coalesce(x.tokens_input, 0),
    'tokens_output', coalesce(x.tokens_output, 0),
    'cache_lectura', coalesce(x.tokens_cache_lectura, 0),
    'cache_escritura', coalesce(x.tokens_cache_escritura, 0),
    'llamadas', coalesce(x.llamadas, 0),
    'costo_usd', round(coalesce(x.costo_micro_usd, 0) / 1000000.0, 4)
  ) order by d.dia), '[]'::jsonb)
  from (select (v_hoy - g)::date as dia from generate_series(0, 29) g) d
  left join public.uso_ia_diario x on x.usuario_id = p_id and x.fecha = d.dia;

  return query
  select 'conteos'::text, jsonb_build_object(
    'medicamentos', (select count(*) from public.medicamentos x where x.usuario_id = p_id),
    'turnos', (select count(*) from public.turnos x where x.usuario_id = p_id),
    'mediciones', (select count(*) from public.mediciones x where x.usuario_id = p_id),
    'estudios', (select count(*) from public.estudios x where x.usuario_id = p_id),
    'consultas', (select count(*) from public.consultas x where x.usuario_id = p_id),
    'vacunas', (select count(*) from public.vacunas x where x.usuario_id = p_id),
    'recuerdos', (select count(*) from public.memorias x where x.usuario_id = p_id and x.estado = 'vigente'),
    'sesiones_chat', (select count(*) from public.sesiones_chat x where x.usuario_id = p_id),
    'dispositivos_push', (select count(*) from public.push_suscripciones x where x.usuario_id = p_id)
  );

  return query
  select 'cuidadores'::text, coalesce(jsonb_agg(jsonb_build_object(
    'id', v.cuidador_id, 'nombre', p.nombre, 'rol', v.rol, 'desde', v.aceptado_at
  ) order by v.aceptado_at), '[]'::jsonb)
  from public.vinculos_cuidador v
  left join public.perfiles p on p.id = v.cuidador_id
  where v.elder_id = p_id and v.estado = 'aceptado';

  return query
  select 'cuida_a'::text, coalesce(jsonb_agg(jsonb_build_object(
    'id', v.elder_id, 'nombre', p.nombre, 'rol', v.rol, 'desde', v.aceptado_at
  ) order by v.aceptado_at), '[]'::jsonb)
  from public.vinculos_cuidador v
  left join public.perfiles p on p.id = v.elder_id
  where v.cuidador_id = p_id and v.estado = 'aceptado';

  return query
  select 'suscripciones'::text, coalesce(jsonb_agg(jsonb_build_object(
    'plan', s.plan, 'estado', s.estado, 'meses', s.meses, 'usd_centavos', s.usd_centavos,
    'ars_pesos', s.ars_pesos, 'creada', s.creada_at
  ) order by s.creada_at desc), '[]'::jsonb)
  from public.vita_plus_suscripciones s
  where s.usuario_id = p_id;

  return query
  select 'pagos'::text, coalesce(jsonb_agg(jsonb_build_object(
    'pago_id', g.pago_id, 'ars_pesos', g.ars_pesos, 'meses', g.meses, 'creado', g.creado_at
  ) order by g.creado_at desc), '[]'::jsonb)
  from public.vita_plus_pagos g
  where g.usuario_id = p_id;
end;
$$;

-- IA y costos -----------------------------------------------------------------------------------------
-- Secciones: diario, top_usuarios, errores, latencia.

create or replace function public.admin_ia(p_dias int default 30)
returns table (o_seccion text, o_datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 90);
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_desde date;
  v_desde_ts timestamptz;
begin
  v_desde := v_hoy - (v_dias - 1);
  v_desde_ts := v_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';

  return query
  select 'diario'::text, coalesce(jsonb_agg(jsonb_build_object(
    'fecha', d.dia,
    'costo_usd', round(coalesce(x.costo, 0) / 1000000.0, 4),
    'tokens_input', coalesce(x.ti, 0),
    'tokens_output', coalesce(x.tout, 0),
    'cache_lectura', coalesce(x.cl, 0),
    'cache_escritura', coalesce(x.ce, 0),
    'ratio_cache', case when coalesce(x.ti, 0) + coalesce(x.cl, 0) > 0
                        then round(coalesce(x.cl, 0)::numeric / (x.ti + x.cl), 4) else null end,
    'llamadas', coalesce(x.llam, 0),
    'usuarios', coalesce(x.us, 0),
    'mensajes', coalesce(m.n, 0)
  ) order by d.dia), '[]'::jsonb)
  from (select (v_hoy - g)::date as dia from generate_series(0, v_dias - 1) g) d
  left join (
    select u.fecha, sum(u.costo_micro_usd) as costo, sum(u.tokens_input) as ti, sum(u.tokens_output) as tout,
           sum(u.tokens_cache_lectura) as cl, sum(u.tokens_cache_escritura) as ce, sum(u.llamadas) as llam,
           count(*) as us
    from public.uso_ia_diario u where u.fecha >= v_desde group by u.fecha
  ) x on x.fecha = d.dia
  left join (
    select (r.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia, count(*) as n
    from public.registros_chat r where r.created_at >= v_desde_ts group by 1
  ) m on m.dia = d.dia;

  return query
  select 'top_usuarios'::text, coalesce(jsonb_agg(t.fila order by t.costo desc), '[]'::jsonb)
  from (
    select sum(u.costo_micro_usd) as costo, jsonb_build_object(
      'id', u.usuario_id,
      'email', max(au.email),
      'nombre', max(p.nombre),
      'costo_usd', round(sum(u.costo_micro_usd) / 1000000.0, 4),
      'tokens', sum(u.tokens_input + u.tokens_output),
      'llamadas', sum(u.llamadas)
    ) as fila
    from public.uso_ia_diario u
    left join auth.users au on au.id = u.usuario_id
    left join public.perfiles p on p.id = u.usuario_id
    where u.fecha >= v_desde
    group by u.usuario_id
    order by sum(u.costo_micro_usd) desc
    limit 10
  ) t;

  return query
  select 'errores'::text, coalesce(jsonb_agg(jsonb_build_object(
    'resultado', e.resultado, 'codigo', e.error_codigo, 'n', e.n
  ) order by e.n desc), '[]'::jsonb)
  from (
    select r.resultado, r.error_codigo, count(*) as n
    from public.registros_chat r
    where r.created_at >= v_desde_ts and r.resultado <> 'ok'
    group by r.resultado, r.error_codigo
  ) e;

  return query
  select 'latencia'::text, jsonb_build_object(
    'respuestas', count(*),
    'ok', count(*) filter (where r.resultado = 'ok'),
    'p50_ms', round((percentile_cont(0.5) within group (order by r.latencia_ms) filter (where r.resultado = 'ok'))::numeric),
    'p95_ms', round((percentile_cont(0.95) within group (order by r.latencia_ms) filter (where r.resultado = 'ok'))::numeric),
    'p50_primer_token_ms', round((percentile_cont(0.5) within group (order by r.latencia_primer_token_ms)
        filter (where r.resultado = 'ok' and r.latencia_primer_token_ms is not null))::numeric),
    'p95_primer_token_ms', round((percentile_cont(0.95) within group (order by r.latencia_primer_token_ms)
        filter (where r.resultado = 'ok' and r.latencia_primer_token_ms is not null))::numeric)
  )
  from public.registros_chat r
  where r.created_at >= v_desde_ts;
end;
$$;

-- vita+ ------------------------------------------------------------------------------------------------
-- Secciones: resumen, no_acreditados, arrepentimientos. Los arrepentimientos y pagos no acreditados no tienen
-- estado de resolución en el esquema (se procesan a mano): se listan del más nuevo al más viejo.

create or replace function public.admin_vita_plus()
returns table (o_seccion text, o_datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select 'resumen'::text, jsonb_build_object(
    'activos', (select count(*) from public.vita_plus_vigencia v where v.vence_at > now()),
    'vencidos', (select count(*) from public.vita_plus_vigencia v where v.vence_at <= now()),
    'canceladas', (select count(*) from public.vita_plus_suscripciones s where s.estado = 'cancelled'),
    'autorizadas', (select count(*) from public.vita_plus_suscripciones s where s.estado = 'authorized'),
    'pausadas', (select count(*) from public.vita_plus_suscripciones s where s.estado = 'paused'),
    'pendientes', (select count(*) from public.vita_plus_suscripciones s where s.estado = 'pending' and s.preapproval_id is not null),
    'ingresos_ars_30d', (select coalesce(sum(g.ars_pesos), 0) from public.vita_plus_pagos g where g.creado_at > now() - interval '30 days'),
    'pagos_30d', (select count(*) from public.vita_plus_pagos g where g.creado_at > now() - interval '30 days'),
    'ingresos_ars_total', (select coalesce(sum(g.ars_pesos), 0) from public.vita_plus_pagos g)
  );

  return query
  select 'no_acreditados'::text, coalesce(jsonb_agg(t.fila order by t.creado desc), '[]'::jsonb)
  from (
    select n.creado_at as creado, jsonb_build_object(
      'clave', n.clave, 'pago_id', n.pago_id, 'motivo', n.motivo, 'monto', n.monto, 'moneda', n.moneda,
      'estado_mp', n.estado_mp, 'usuario_id', n.usuario_id, 'email', au.email, 'creado', n.creado_at
    ) as fila
    from public.vita_plus_pagos_no_acreditados n
    left join auth.users au on au.id = n.usuario_id
    order by n.creado_at desc
    limit 50
  ) t;

  return query
  select 'arrepentimientos'::text, coalesce(jsonb_agg(t.fila order by t.solicitado desc), '[]'::jsonb)
  from (
    select a.solicitado_at as solicitado, jsonb_build_object(
      'id', a.id, 'usuario_id', a.usuario_id, 'email', au.email, 'nombre', p.nombre,
      'solicitado', a.solicitado_at, 'plan', s.plan, 'ars_pesos', s.ars_pesos
    ) as fila
    from public.vita_plus_arrepentimientos a
    left join auth.users au on au.id = a.usuario_id
    left join public.perfiles p on p.id = a.usuario_id
    left join public.vita_plus_suscripciones s on s.id = a.suscripcion_id
    order by a.solicitado_at desc
    limit 50
  ) t;
end;
$$;

-- Sistema ---------------------------------------------------------------------------------------------
-- Secciones: cron, http, db, tablas, migracion, storage, push. Lo opcional (pg_cron, pg_net, storage, tabla de
-- migraciones) se consulta solo si existe, con SQL dinámico, para que la función no falle si falta.

create or replace function public.admin_sistema()
returns table (o_seccion text, o_datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := '[]'::jsonb;
  v_http jsonb := '[]'::jsonb;
  v_migracion jsonb := jsonb_build_object('version', null);
  v_storage jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', j.jobname, 'schedule', j.schedule, 'activo', j.active,
        'ultimo_estado', l.status, 'ultima_corrida', l.start_time,
        'corridas_24h', coalesce(s.n, 0), 'fallos_24h', coalesce(s.f, 0)
      ) order by j.jobname), '[]'::jsonb)
      from cron.job j
      left join lateral (
        select d.status, d.start_time from cron.job_run_details d
        where d.jobid = j.jobid order by d.start_time desc limit 1
      ) l on true
      left join lateral (
        select count(*) as n, count(*) filter (where d.status = 'failed') as f
        from cron.job_run_details d
        where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'
      ) s on true
    $q$ into v_cron;
  end if;

  if to_regclass('net._http_response') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('codigo', x.codigo, 'n', x.n) order by x.n desc), '[]'::jsonb)
      from (
        select case when h.timed_out is true then 'timeout' else coalesce(h.status_code::text, 'sin_respuesta') end as codigo,
               count(*) as n
        from net._http_response h
        where h.created > now() - interval '24 hours'
        group by 1
      ) x
    $q$ into v_http;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $q$select jsonb_build_object('version', max(m.version)) from supabase_migrations.schema_migrations m$q$
      into v_migracion;
  end if;

  if to_regclass('storage.objects') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('bucket', x.bucket_id, 'objetos', x.n, 'bytes', x.bytes)
                                order by x.bytes desc), '[]'::jsonb)
      from (
        select o.bucket_id, count(*) as n, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
        from storage.objects o group by o.bucket_id
      ) x
    $q$ into v_storage;
  end if;

  return query select 'cron'::text, v_cron;
  return query select 'http'::text, v_http;
  return query select 'db'::text, jsonb_build_object('bytes', pg_database_size(current_database()));
  return query
  select 'tablas'::text, coalesce(jsonb_agg(jsonb_build_object(
    'nombre', t.nombre, 'bytes', t.bytes, 'filas', t.filas) order by t.bytes desc), '[]'::jsonb)
  from (
    select c.relname::text as nombre, pg_total_relation_size(c.oid) as bytes,
           greatest(c.reltuples, 0)::bigint as filas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc
    limit 10
  ) t;
  return query select 'migracion'::text, v_migracion;
  return query select 'storage'::text, v_storage;
  return query
  select 'push'::text, jsonb_build_object(
    'suscripciones', count(*), 'usuarios', count(distinct p.usuario_id))
  from public.push_suscripciones p;
end;
$$;

-- Permisos --------------------------------------------------------------------------------------------

revoke all on function public.admin_tipo_cuenta(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_actividad() from public, anon, authenticated;
revoke all on function public.admin_resumen() from public, anon, authenticated;
revoke all on function public.admin_usuarios(text, text, int, int) from public, anon, authenticated;
revoke all on function public.admin_usuario(uuid) from public, anon, authenticated;
revoke all on function public.admin_ia(int) from public, anon, authenticated;
revoke all on function public.admin_vita_plus() from public, anon, authenticated;
revoke all on function public.admin_sistema() from public, anon, authenticated;

grant execute on function public.admin_tipo_cuenta(jsonb, jsonb, text) to service_role;
grant execute on function public.admin_actividad() to service_role;
grant execute on function public.admin_resumen() to service_role;
grant execute on function public.admin_usuarios(text, text, int, int) to service_role;
grant execute on function public.admin_usuario(uuid) to service_role;
grant execute on function public.admin_ia(int) to service_role;
grant execute on function public.admin_vita_plus() to service_role;
grant execute on function public.admin_sistema() to service_role;
