-- Vitapp — códigos de vita+ y endurecimiento del panel /adminvita.
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- Requiere las migraciones 044 (vita+) y 045 (panel admin); el bloque de abajo corta si falta algo.
--
-- Decisiones del dueño (2026-11-01):
--   * Dos TIPOS de código: 'plus' = vita+ completo por 15 días; 'admin' = vita+ sin vencimiento. Los códigos se
--     GENERAN desde el panel (no son cadenas fijas), con usos máximos, vencimiento opcional del propio código y
--     revocación. Para ver en el panel quién tiene vita+ y por qué (origen).
--   * El panel pide un segundo factor por email después de entrar con Google, tiene logout, se cierra por
--     inactividad (cookie firmada que se renueva en cada vista) y deja auditoría de acciones.
--
--   * vita_plus_codigos: SOLO se guarda el hash sha256 del código normalizado y los últimos 4 caracteres; el código
--     completo se muestra una única vez al crearlo. RLS activada SIN policies: solo service_role.
--   * vita_plus_canjes: quién canjeó qué (único por código+usuario). RLS sin policies.
--   * vita_plus_vigencia gana `permanente` (vita+ sin vencimiento; `vence_at` sigue siendo not null y queda como
--     referencia) y `origen` ('pago' | 'codigo_plus' | 'codigo_admin'). Un pago posterior a un código admin NO borra
--     `permanente`. vita_plus_activo(), mi_estado_vita_plus() y el panel cuentan lo permanente como activo.
--   * RPC canjear_codigo_vita_plus / crear_codigo_vita_plus / revocar_codigo_vita_plus: SECURITY DEFINER,
--     search_path vacío, ejecutables SOLO por service_role (el servidor valida la sesión y pasa el usuario de ella).
--     Revocar un código impide nuevos canjes; no le quita el vita+ a quien ya lo canjeó.
--   * admin_codigos_verificacion: códigos de 6 dígitos del segundo factor del panel (solo el hash, vencen a los 10
--     minutos, máximo 5 intentos). RPC verificar_codigo_admin atómica. RLS sin policies.
--   * admin_2fa_revocaciones: "cookies del segundo factor emitidas antes de este instante ya no valen" por admin
--     (logout / inactividad). RLS sin policies.
--   * admin_acciones: auditoría de acciones del panel (códigos creados/revocados, push enviados). Sin texto libre
--     más allá del título del mensaje. RLS sin policies.
--   * Se redefinen (create or replace / drop+create) las funciones admin_* de la 045 para exponer origen y
--     permanencia; la 045 no se toca.
-- Convenciones del repo: `returns table` con columnas prefijadas, idempotente.
-- Rollback (orden inverso; las funciones admin_* y mi_estado_vita_plus de la 044/045 hay que re-crearlas desde sus archivos):
--   drop function if exists public.verificar_codigo_admin(text, text), public.revocar_codigo_vita_plus(uuid),
--     public.crear_codigo_vita_plus(text, int, timestamptz, text, text, text),
--     public.canjear_codigo_vita_plus(uuid, text);
--   drop table if exists public.admin_2fa_revocaciones, public.admin_acciones, public.admin_codigos_verificacion, public.vita_plus_canjes,
--     public.vita_plus_codigos;
--   alter table public.vita_plus_vigencia drop column if exists permanente, drop column if exists origen;

do $$
begin
  if to_regclass('public.vita_plus_vigencia') is null or to_regclass('public.admin_accesos') is null then
    raise exception 'codigos_vita_plus: faltan las migraciones 044 y/o 045';
  end if;
end;
$$;

-- Vigencia: permanencia y origen ----------------------------------------------------------------------

alter table public.vita_plus_vigencia add column if not exists permanente boolean not null default false;
alter table public.vita_plus_vigencia add column if not exists origen text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vita_plus_vigencia_origen_check') then
    alter table public.vita_plus_vigencia
      add constraint vita_plus_vigencia_origen_check check (origen in ('pago', 'codigo_plus', 'codigo_admin'));
  end if;
end;
$$;

-- Todo lo anterior a los códigos vino de un pago.
update public.vita_plus_vigencia set origen = 'pago' where origen is null;

-- Códigos ---------------------------------------------------------------------------------------------

create table if not exists public.vita_plus_codigos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('plus', 'admin')),
  dias int check (dias is null or dias > 0),
  codigo_hash text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  ultimos4 text not null check (char_length(ultimos4) = 4),
  usos_max int not null check (usos_max >= 1),
  usos int not null default 0 check (usos >= 0),
  vence_codigo_at timestamptz,
  revocado_at timestamptz,
  creado_por_email text not null check (char_length(creado_por_email) between 3 and 320),
  created_at timestamptz not null default now(),
  constraint vita_plus_codigos_dias_tipo check ((tipo = 'plus' and dias is not null) or (tipo = 'admin' and dias is null)),
  constraint vita_plus_codigos_usos check (usos <= usos_max)
);

create index if not exists idx_vita_plus_codigos_created_at on public.vita_plus_codigos (created_at desc);

create table if not exists public.vita_plus_canjes (
  codigo_id uuid not null references public.vita_plus_codigos (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (codigo_id, usuario_id)
);

create index if not exists idx_vita_plus_canjes_usuario on public.vita_plus_canjes (usuario_id);

alter table public.vita_plus_codigos enable row level security;
alter table public.vita_plus_canjes enable row level security;
-- Deliberadamente sin policies: solo service_role (bypassa RLS).
revoke all on table public.vita_plus_codigos, public.vita_plus_canjes from public, anon, authenticated;
grant select, insert, update on table public.vita_plus_codigos to service_role;
grant select, insert on table public.vita_plus_canjes to service_role;

-- Segundo factor del panel y auditoría ----------------------------------------------------------------

create table if not exists public.admin_codigos_verificacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  intentos int not null default 0 check (intentos >= 0),
  vence_at timestamptz not null,
  usado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_codigos_verificacion_email
  on public.admin_codigos_verificacion (admin_email, created_at desc);

-- Revocación del segundo factor: al cerrar sesión (o por inactividad) se anota "desde cuándo" valen las cookies de
-- ese admin. `requireAdmin` rechaza una cookie emitida antes de `revocado_desde`, aunque el navegador la conserve.
create table if not exists public.admin_2fa_revocaciones (
  admin_email text primary key check (char_length(admin_email) between 3 and 320),
  revocado_desde timestamptz not null
);

create table if not exists public.admin_acciones (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  accion text not null check (char_length(accion) between 1 and 60),
  objetivo_id text check (objetivo_id is null or char_length(objetivo_id) <= 100),
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_acciones_admin on public.admin_acciones (admin_email, accion, created_at desc);

alter table public.admin_codigos_verificacion enable row level security;
alter table public.admin_acciones enable row level security;
alter table public.admin_2fa_revocaciones enable row level security;
revoke all on table public.admin_codigos_verificacion, public.admin_acciones, public.admin_2fa_revocaciones from public, anon, authenticated;
grant select, insert, update on table public.admin_2fa_revocaciones to service_role;
grant select, insert, update on table public.admin_codigos_verificacion to service_role;
grant select, insert on table public.admin_acciones to service_role;

-- Lectura de la sesión: la permanencia cuenta como activo ----------------------------------------------

create or replace function public.vita_plus_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select v.permanente or v.vence_at > now() from public.vita_plus_vigencia v where v.usuario_id = auth.uid()),
    false);
$$;

-- El tipo de retorno cambia (columnas nuevas): hay que borrarla antes de recrearla.
drop function if exists public.mi_estado_vita_plus();

create function public.mi_estado_vita_plus()
returns table (
  vp_activo boolean,
  vp_vence_at timestamptz,
  vp_plan text,
  vp_estado text,
  vp_renueva boolean,
  vp_puede_arrepentirse boolean,
  vp_permanente boolean,
  vp_origen text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_vence timestamptz;
  v_perm boolean;
  v_origen text;
  v_plan text;
  v_estado text;
begin
  if v_uid is null then
    return query select false, null::timestamptz, null::text, 'none'::text, false, false, false, null::text;
    return;
  end if;

  select v.vence_at, v.permanente, v.origen into v_vence, v_perm, v_origen
  from public.vita_plus_vigencia v where v.usuario_id = v_uid;

  select s.plan, s.estado into v_plan, v_estado
  from public.vita_plus_suscripciones s
  where s.usuario_id = v_uid and s.preapproval_id is not null
  order by case s.estado when 'authorized' then 3 when 'paused' then 2 when 'pending' then 1 else 0 end desc,
           s.creada_at desc
  limit 1;

  return query select
    coalesce(v_perm, false) or coalesce(v_vence > now(), false),
    v_vence,
    v_plan,
    coalesce(v_estado, 'none'),
    coalesce(v_estado = 'authorized', false),
    exists (
      select 1 from public.vita_plus_pagos p
      where p.usuario_id = v_uid
        and p.creado_at > now() - interval '10 days'
        and not exists (select 1 from public.vita_plus_pagos q where q.suscripcion_id = p.suscripcion_id and q.creado_at < p.creado_at)
        and not exists (select 1 from public.vita_plus_arrepentimientos a where a.suscripcion_id = p.suscripcion_id)
    ),
    coalesce(v_perm, false),
    v_origen;
end;
$$;

revoke execute on function public.mi_estado_vita_plus(), public.vita_plus_activo() from public, anon;
grant execute on function public.mi_estado_vita_plus(), public.vita_plus_activo() to authenticated, service_role;

-- Un pago no borra la permanencia ni pisa el origen de un código admin ---------------------------------

create or replace function public.registrar_pago_vita_plus(
  p_usuario uuid,
  p_pago text,
  p_suscripcion uuid,
  p_ars int
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_filas int;
  v_vence timestamptz;
  v_meses int;
  v_ars int;
begin
  if p_usuario is null or p_pago is null or p_suscripcion is null or p_ars is null or p_ars <= 0 then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;

  select s.meses, s.ars_pesos into v_meses, v_ars
  from public.vita_plus_suscripciones s
  where s.id = p_suscripcion and s.usuario_id = p_usuario;

  if v_meses is null then
    raise exception 'subscription_not_found' using errcode = 'P0002';
  end if;
  if v_ars <> p_ars then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  insert into public.vita_plus_pagos (pago_id, usuario_id, suscripcion_id, ars_pesos, meses)
  values (p_pago, p_usuario, p_suscripcion, p_ars, v_meses)
  on conflict (pago_id) do nothing;
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    return null;
  end if;

  -- permanente NO se toca; el origen pasa a 'pago' salvo que la cuenta sea permanente (código admin).
  insert into public.vita_plus_vigencia as v (usuario_id, vence_at, actualizada_at, origen)
  values (p_usuario, now() + make_interval(months => v_meses), now(), 'pago')
  on conflict (usuario_id) do update
    set vence_at = greatest(now(), v.vence_at) + make_interval(months => v_meses),
        actualizada_at = now(),
        origen = case when v.permanente then v.origen else 'pago' end
  returning v.vence_at into v_vence;

  return v_vence;
end;
$$;

-- Códigos: RPC (solo service_role) --------------------------------------------------------------------

create or replace function public.crear_codigo_vita_plus(
  p_tipo text,
  p_usos_max int,
  p_vence timestamptz,
  p_hash text,
  p_ultimos4 text,
  p_creado_por text
)
returns table (cr_id uuid, cr_resultado text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('plus', 'admin') or p_usos_max is null or p_usos_max < 1 or p_usos_max > 10000
     or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_ultimos4 is null or char_length(p_ultimos4) <> 4
     or p_creado_por is null or char_length(p_creado_por) < 3 then
    return query select null::uuid, 'invalido'::text;
    return;
  end if;
  if p_vence is not null and p_vence <= now() then
    return query select null::uuid, 'vencimiento_pasado'::text;
    return;
  end if;

  begin
    insert into public.vita_plus_codigos (tipo, dias, codigo_hash, ultimos4, usos_max, vence_codigo_at, creado_por_email)
    values (p_tipo, case when p_tipo = 'plus' then 15 else null end, p_hash, p_ultimos4, p_usos_max, p_vence, p_creado_por)
    returning id into v_id;
  exception when unique_violation then
    return query select null::uuid, 'duplicado'::text;
    return;
  end;

  return query select v_id, 'ok'::text;
end;
$$;

create or replace function public.revocar_codigo_vita_plus(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_filas int;
begin
  update public.vita_plus_codigos c set revocado_at = now() where c.id = p_id and c.revocado_at is null;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

-- Canje atómico (lock de la fila del código). Resultados: ok | invalido | revocado | vencido | agotado |
-- ya_canjeado | ya_permanente. Un 'plus' sobre una cuenta ya permanente no consume el código.
create or replace function public.canjear_codigo_vita_plus(p_usuario uuid, p_hash text)
returns table (cj_resultado text, cj_vence_at timestamptz, cj_permanente boolean, cj_tipo text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cod public.vita_plus_codigos%rowtype;
  v_vig public.vita_plus_vigencia%rowtype;
  v_vence timestamptz;
  v_perm boolean;
begin
  if p_usuario is null or p_hash is null then
    return query select 'invalido'::text, null::timestamptz, false, null::text;
    return;
  end if;

  select * into v_cod from public.vita_plus_codigos c where c.codigo_hash = p_hash for update;
  if not found then
    return query select 'invalido'::text, null::timestamptz, false, null::text;
    return;
  end if;
  if v_cod.revocado_at is not null then
    return query select 'revocado'::text, null::timestamptz, false, null::text;
    return;
  end if;
  if v_cod.vence_codigo_at is not null and v_cod.vence_codigo_at <= now() then
    return query select 'vencido'::text, null::timestamptz, false, null::text;
    return;
  end if;
  if exists (select 1 from public.vita_plus_canjes j where j.codigo_id = v_cod.id and j.usuario_id = p_usuario) then
    return query select 'ya_canjeado'::text, null::timestamptz, false, null::text;
    return;
  end if;
  if v_cod.usos >= v_cod.usos_max then
    return query select 'agotado'::text, null::timestamptz, false, null::text;
    return;
  end if;

  select * into v_vig from public.vita_plus_vigencia v where v.usuario_id = p_usuario for update;
  if found and v_vig.permanente and v_cod.tipo = 'plus' then
    return query select 'ya_permanente'::text, v_vig.vence_at, true, v_cod.tipo;
    return;
  end if;

  insert into public.vita_plus_canjes (codigo_id, usuario_id) values (v_cod.id, p_usuario);
  update public.vita_plus_codigos c set usos = c.usos + 1 where c.id = v_cod.id;

  if v_cod.tipo = 'admin' then
    insert into public.vita_plus_vigencia as v (usuario_id, vence_at, actualizada_at, permanente, origen)
    values (p_usuario, now(), now(), true, 'codigo_admin')
    on conflict (usuario_id) do update
      set permanente = true, origen = 'codigo_admin', actualizada_at = now()
    returning v.vence_at, v.permanente into v_vence, v_perm;
  else
    insert into public.vita_plus_vigencia as v (usuario_id, vence_at, actualizada_at, origen)
    values (p_usuario, now() + make_interval(days => v_cod.dias), now(), 'codigo_plus')
    on conflict (usuario_id) do update
      set vence_at = greatest(now(), v.vence_at) + make_interval(days => v_cod.dias),
          actualizada_at = now(),
          origen = 'codigo_plus'
    returning v.vence_at, v.permanente into v_vence, v_perm;
  end if;

  return query select 'ok'::text, v_vence, v_perm, v_cod.tipo;
end;
$$;

-- Segundo factor del panel: verificación atómica --------------------------------------------------------
-- Toma el código sin usar más reciente del admin (lock), suma un intento y compara. Resultados: ok | incorrecto |
-- agotado (5 intentos) | vencido | sin_codigo. Un código correcto se marca usado: no sirve dos veces.
create or replace function public.verificar_codigo_admin(p_email text, p_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fila public.admin_codigos_verificacion%rowtype;
begin
  select * into v_fila from public.admin_codigos_verificacion c
  where c.admin_email = lower(p_email) and c.usado_at is null
  order by c.created_at desc limit 1 for update;

  if not found then
    return 'sin_codigo';
  end if;
  if v_fila.vence_at <= now() then
    return 'vencido';
  end if;
  if v_fila.intentos >= 5 then
    return 'agotado';
  end if;

  update public.admin_codigos_verificacion c set intentos = c.intentos + 1 where c.id = v_fila.id;

  if v_fila.codigo_hash = p_hash then
    update public.admin_codigos_verificacion c set usado_at = now() where c.id = v_fila.id;
    return 'ok';
  end if;
  if v_fila.intentos + 1 >= 5 then
    return 'agotado';
  end if;
  return 'incorrecto';
end;
$$;

-- Funciones admin_* de la 045 con origen y permanencia ----------------------------------------------------

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
    (select count(*) from public.vita_plus_vigencia v where v.permanente or v.vence_at > now()),
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

-- admin_usuarios cambia de columnas: se borra y se recrea.
drop function if exists public.admin_usuarios(text, text, int, int);

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
  o_permanente boolean,
  o_origen text,
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
  v_filtro text := case when p_filtro in ('vita_plus', 'vp_pago', 'vp_codigo_plus', 'vp_codigo_admin', 'inactivos_7', 'inactivos_30', 'gestionados', 'sin_onboarding')
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
           vg.vence_at, coalesce(vg.permanente, false) as perm, vg.origen,
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
            when 'vita_plus' then b.perm or coalesce(b.vence_at > now(), false)
            when 'vp_pago' then (b.perm or coalesce(b.vence_at > now(), false)) and b.origen = 'pago'
            when 'vp_codigo_plus' then (b.perm or coalesce(b.vence_at > now(), false)) and b.origen = 'codigo_plus'
            when 'vp_codigo_admin' then (b.perm or coalesce(b.vence_at > now(), false)) and b.origen = 'codigo_admin'
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
    f.perm or coalesce(f.vence_at > now(), false),
    f.vence_at,
    f.perm,
    f.origen,
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
    'vita_plus', coalesce(vg.permanente, false) or coalesce(vg.vence_at > now(), false),
    'permanente', coalesce(vg.permanente, false),
    'origen', vg.origen,
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
    'activos', (select count(*) from public.vita_plus_vigencia v where v.permanente or v.vence_at > now()),
    'vencidos', (select count(*) from public.vita_plus_vigencia v where not v.permanente and v.vence_at <= now()),
    'permanentes', (select count(*) from public.vita_plus_vigencia v where v.permanente),
    'activos_pago', (select count(*) from public.vita_plus_vigencia v
                      where (v.permanente or v.vence_at > now()) and coalesce(v.origen, 'pago') = 'pago'),
    'activos_codigo_plus', (select count(*) from public.vita_plus_vigencia v
                             where (v.permanente or v.vence_at > now()) and v.origen = 'codigo_plus'),
    'activos_codigo_admin', (select count(*) from public.vita_plus_vigencia v
                              where (v.permanente or v.vence_at > now()) and v.origen = 'codigo_admin'),
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

-- Permisos --------------------------------------------------------------------------------------------

revoke all on function public.crear_codigo_vita_plus(text, int, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.revocar_codigo_vita_plus(uuid) from public, anon, authenticated;
revoke all on function public.canjear_codigo_vita_plus(uuid, text) from public, anon, authenticated;
revoke all on function public.verificar_codigo_admin(text, text) from public, anon, authenticated;
revoke all on function public.registrar_pago_vita_plus(uuid, text, uuid, int) from public, anon, authenticated;
revoke all on function public.admin_resumen() from public, anon, authenticated;
revoke all on function public.admin_usuarios(text, text, int, int) from public, anon, authenticated;
revoke all on function public.admin_usuario(uuid) from public, anon, authenticated;
revoke all on function public.admin_vita_plus() from public, anon, authenticated;

grant execute on function public.crear_codigo_vita_plus(text, int, timestamptz, text, text, text) to service_role;
grant execute on function public.revocar_codigo_vita_plus(uuid) to service_role;
grant execute on function public.canjear_codigo_vita_plus(uuid, text) to service_role;
grant execute on function public.verificar_codigo_admin(text, text) to service_role;
grant execute on function public.registrar_pago_vita_plus(uuid, text, uuid, int) to service_role;
grant execute on function public.admin_resumen() to service_role;
grant execute on function public.admin_usuarios(text, text, int, int) to service_role;
grant execute on function public.admin_usuario(uuid) to service_role;
grant execute on function public.admin_vita_plus() to service_role;
