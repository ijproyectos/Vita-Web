-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- vita+ de pago con Mercado Pago (suscripción sin plan asociado, preapproval en estado "pending").
--
-- El precio al usuario es en DÓLARES (anual US$ 35,88 una vez por año, mensual US$ 4,99) pero Mercado Pago cobra en
-- ARS: al crear la suscripción el servidor pesifica al dólar oficial (BNA, venta) del día y GUARDA el resultado por
-- suscripción (plan, usd_centavos, fx_ars, ars_pesos). Mercado Pago mantiene ese monto en pesos en las renovaciones
-- (no hay repesificación automática en esta etapa). El webhook otorga vita+ solo si el pago aprobado coincide con
-- el monto guardado de ESA suscripción.
--
--   * vita_plus_suscripciones: una fila por intento de suscripción. `external_reference` es un uuid aleatorio generado
--     por el servidor (nunca por el cliente); `preapproval_id` es el id de Mercado Pago, se guarda cuando responde.
--   * vita_plus_pagos: un cobro aprobado ya acreditado. Su PK (id del pago de Mercado Pago) es la clave de
--     idempotencia: la misma notificación dos veces acredita una sola vez.
--   * vita_plus_vigencia: hasta cuándo tiene vita+ pago cada persona (una fila por persona).
--   * RLS: la persona SOLO lee sus propias filas. No hay grants de INSERT/UPDATE/DELETE para ella; toda escritura
--     pasa por las funciones security definer de abajo, ejecutables SOLO por service_role (el servidor valida la
--     sesión, calcula el precio y usa el cliente admin; el cliente nunca decide montos).
--   * mi_estado_vita_plus() / vita_plus_activo(): lectura de la sesión (security definer, solo la propia cuenta).
--
-- Cancelar NO toca la vigencia: vita+ sigue hasta lo ya pagado. Sin reembolsos ni prorrateo.
-- Convenciones del repo: `returns table` con columnas prefijadas (vp_), pgcrypto vive en `extensions`
-- (gen_random_uuid() es nativo), idempotente (if not exists / or replace / drop policy if exists).
-- Rollback:
--   drop function if exists public.solicitar_arrepentimiento_vita_plus(uuid),
--     public.anotar_pago_no_acreditado_vita_plus(text, text, text, text, text, numeric, text, text, uuid, uuid),
--     public.reclamar_escritura_mp_vita_plus(uuid, uuid, int),
--     public.actualizar_estado_suscripcion_vita_plus(uuid, text, text),
--     public.registrar_pago_vita_plus(uuid, text, uuid, int),
--     public.iniciar_suscripcion_vita_plus(uuid, text, text, int, int, numeric, int),
--     public.vita_plus_activo(), public.mi_estado_vita_plus();
--   drop table if exists public.vita_plus_arrepentimientos, public.vita_plus_pagos_no_acreditados, public.vita_plus_pagos, public.vita_plus_vigencia, public.vita_plus_suscripciones;

-- Tablas -------------------------------------------------------------------------------------------

create table if not exists public.vita_plus_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  external_reference text not null unique check (char_length(external_reference) between 16 and 100),
  preapproval_id text unique check (preapproval_id is null or char_length(preapproval_id) between 1 and 100),
  estado text not null default 'pending' check (estado in ('pending', 'authorized', 'paused', 'cancelled')),
  plan text not null check (plan in ('anual', 'mensual')),
  -- Cada cuántos meses cobra Mercado Pago = cuántos meses de vita+ otorga cada cobro aprobado.
  meses int not null check (meses in (1, 12)),
  -- Lo que vale un período en dólares (centavos enteros), el dólar oficial usado y los pesos cobrados.
  usd_centavos int not null check (usd_centavos > 0),
  fx_ars numeric(14, 4) not null check (fx_ars > 0),
  ars_pesos int not null check (ars_pesos > 0),
  creada_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now(),
  -- Última vez que una acción de la persona (cancelar) escribió en Mercado Pago (límite de frecuencia).
  ultima_escritura_mp_at timestamptz,
  constraint vita_plus_plan_meses check ((plan = 'anual' and meses = 12) or (plan = 'mensual' and meses = 1))
);

create index if not exists vita_plus_suscripciones_usuario_idx
  on public.vita_plus_suscripciones (usuario_id, creada_at desc);

create table if not exists public.vita_plus_pagos (
  pago_id text primary key check (char_length(pago_id) between 1 and 100),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  suscripcion_id uuid not null references public.vita_plus_suscripciones (id) on delete cascade,
  ars_pesos int not null check (ars_pesos > 0),
  meses int not null check (meses in (1, 12)),
  creado_at timestamptz not null default now()
);

create index if not exists vita_plus_pagos_usuario_idx on public.vita_plus_pagos (usuario_id, creado_at desc);

create table if not exists public.vita_plus_vigencia (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  vence_at timestamptz not null,
  actualizada_at timestamptz not null default now()
);

-- Cobros aprobados en Mercado Pago que NO se acreditaron como vita+ (monto distinto, suscripción desconocida,
-- duplicada, ...) y eventos de preapproval ignorados. Un cobro real nunca se descarta en silencio: queda acá para
-- revisarlo o reembolsarlo a mano. `clave` es el id del pago (o 'pre:<id>:<motivo>' para un evento sin pago) y
-- hace idempotentes los reenvíos. RLS sin policies: solo service_role.
create table if not exists public.vita_plus_pagos_no_acreditados (
  clave text primary key check (char_length(clave) between 1 and 300),
  pago_id text,
  preapproval_id text,
  external_reference text,
  motivo text not null check (char_length(motivo) between 1 and 60),
  monto numeric(14, 2),
  moneda text,
  estado_mp text,
  usuario_id uuid,
  suscripcion_id uuid,
  creado_at timestamptz not null default now()
);

-- Pedidos del "botón de arrepentimiento" (Res. 424/2020): revocación dentro de los 10 días de contratar.
-- El reembolso se procesa a mano; acá solo queda el pedido.
create table if not exists public.vita_plus_arrepentimientos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  suscripcion_id uuid not null unique references public.vita_plus_suscripciones (id) on delete cascade,
  solicitado_at timestamptz not null default now()
);

alter table public.vita_plus_pagos_no_acreditados enable row level security;
alter table public.vita_plus_arrepentimientos enable row level security;
alter table public.vita_plus_suscripciones enable row level security;
alter table public.vita_plus_pagos enable row level security;
alter table public.vita_plus_vigencia enable row level security;

revoke all on table public.vita_plus_suscripciones, public.vita_plus_pagos, public.vita_plus_vigencia,
  public.vita_plus_pagos_no_acreditados, public.vita_plus_arrepentimientos from public, anon, authenticated;
grant select on table public.vita_plus_suscripciones, public.vita_plus_pagos, public.vita_plus_vigencia,
  public.vita_plus_arrepentimientos to authenticated, service_role;
grant select on table public.vita_plus_pagos_no_acreditados to service_role;

drop policy if exists vita_plus_arrepentimientos_select_propio on public.vita_plus_arrepentimientos;
create policy vita_plus_arrepentimientos_select_propio on public.vita_plus_arrepentimientos
  for select to authenticated using (usuario_id = (select auth.uid()));

drop policy if exists vita_plus_suscripciones_select_propia on public.vita_plus_suscripciones;
create policy vita_plus_suscripciones_select_propia on public.vita_plus_suscripciones
  for select to authenticated using (usuario_id = (select auth.uid()));

drop policy if exists vita_plus_pagos_select_propio on public.vita_plus_pagos;
create policy vita_plus_pagos_select_propio on public.vita_plus_pagos
  for select to authenticated using (usuario_id = (select auth.uid()));

drop policy if exists vita_plus_vigencia_select_propia on public.vita_plus_vigencia;
create policy vita_plus_vigencia_select_propia on public.vita_plus_vigencia
  for select to authenticated using (usuario_id = (select auth.uid()));

-- Lectura de la sesión -----------------------------------------------------------------------------

-- Siempre devuelve UNA fila. vp_estado: 'none' si nunca intentó (o solo hay intentos que no llegaron a Mercado Pago).
create or replace function public.mi_estado_vita_plus()
returns table (
  vp_activo boolean,
  vp_vence_at timestamptz,
  vp_plan text,
  vp_estado text,
  vp_renueva boolean,
  vp_puede_arrepentirse boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_vence timestamptz;
  v_plan text;
  v_estado text;
begin
  if v_uid is null then
    return query select false, null::timestamptz, null::text, 'none'::text, false, false;
    return;
  end if;

  select v.vence_at into v_vence from public.vita_plus_vigencia v where v.usuario_id = v_uid;

  select s.plan, s.estado into v_plan, v_estado
  from public.vita_plus_suscripciones s
  where s.usuario_id = v_uid and s.preapproval_id is not null
  order by case s.estado when 'authorized' then 3 when 'paused' then 2 when 'pending' then 1 else 0 end desc,
           s.creada_at desc
  limit 1;

  return query select
    coalesce(v_vence > now(), false),
    v_vence,
    v_plan,
    coalesce(v_estado, 'none'),
    coalesce(v_estado = 'authorized', false),
    -- Botón de arrepentimiento: dentro de los 10 días del PRIMER cobro de una suscripción, si no lo pidió ya.
    exists (
      select 1 from public.vita_plus_pagos p
      where p.usuario_id = v_uid
        and p.creado_at > now() - interval '10 days'
        and not exists (select 1 from public.vita_plus_pagos q where q.suscripcion_id = p.suscripcion_id and q.creado_at < p.creado_at)
        and not exists (select 1 from public.vita_plus_arrepentimientos a where a.suscripcion_id = p.suscripcion_id)
    );
end;
$$;

-- Punto único de lectura para futuros gates de funciones: ¿la cuenta de la sesión tiene vita+ vigente?
create or replace function public.vita_plus_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select v.vence_at > now() from public.vita_plus_vigencia v where v.usuario_id = auth.uid()), false);
$$;

-- Escrituras (solo service_role) ------------------------------------------------------------------

-- Crea la fila pendiente bajo un lock por persona. 'already_subscribed' si ya tiene una suscripción autorizada o
-- pausada (una pausada se puede reactivar: sin esto habría dos autorizadas y doble cobro); 'create_throttled' si
-- creó otra hace menos de 60 s.
create or replace function public.iniciar_suscripcion_vita_plus(
  p_usuario uuid,
  p_referencia text,
  p_plan text,
  p_meses int,
  p_usd_centavos int,
  p_fx numeric,
  p_ars int
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_usuario is null or p_referencia is null or p_plan is null or p_meses is null
     or p_usd_centavos is null or p_fx is null or p_ars is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vita_plus:' || p_usuario::text, 0));

  if exists (
    select 1 from public.vita_plus_suscripciones s
    where s.usuario_id = p_usuario and s.estado in ('authorized', 'paused')
  ) then
    raise exception 'already_subscribed' using errcode = '54000';
  end if;

  if exists (
    select 1 from public.vita_plus_suscripciones s
    where s.usuario_id = p_usuario and s.estado = 'pending' and s.creada_at > now() - interval '60 seconds'
  ) then
    raise exception 'create_throttled' using errcode = '54000';
  end if;

  insert into public.vita_plus_suscripciones (usuario_id, external_reference, plan, meses, usd_centavos, fx_ars, ars_pesos)
  values (p_usuario, p_referencia, p_plan, p_meses, p_usd_centavos, p_fx, p_ars)
  returning id into v_id;

  return v_id;
end;
$$;

-- Acredita UN cobro aprobado. Idempotente por id de pago: devuelve la nueva fecha de vencimiento o NULL si ese
-- pago ya estaba acreditado. Los meses salen de la suscripción (no del llamador) y el monto tiene que ser el
-- guardado: defensa en profundidad además del chequeo del webhook.
-- vence_at = greatest(now(), vence_at actual) + meses: pagar antes no pierde tiempo y quien venció arranca de hoy.
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

  insert into public.vita_plus_vigencia as v (usuario_id, vence_at, actualizada_at)
  values (p_usuario, now() + make_interval(months => v_meses), now())
  on conflict (usuario_id) do update
    set vence_at = greatest(now(), v.vence_at) + make_interval(months => v_meses),
        actualizada_at = now()
  returning v.vence_at into v_vence;

  return v_vence;
end;
$$;

-- Sincroniza el estado de una suscripción y guarda su preapproval_id (solo si aún no estaba). 'cancelled' es
-- terminal: una notificación vieja nunca la reabre; 'pending' no degrada. false si no existe.
create or replace function public.actualizar_estado_suscripcion_vita_plus(
  p_suscripcion uuid,
  p_estado text,
  p_preapproval_id text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_filas int;
begin
  if p_estado is null or p_estado not in ('pending', 'authorized', 'paused', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.vita_plus_suscripciones s
  -- 'cancelled' es terminal y 'pending' nunca pisa un estado más avanzado (no se degrada).
  set estado = case
                 when s.estado = 'cancelled' then s.estado
                 when p_estado = 'pending' then s.estado
                 else p_estado
               end,
      preapproval_id = coalesce(s.preapproval_id, p_preapproval_id),
      actualizada_at = now()
  where s.id = p_suscripcion;
  get diagnostics v_filas = row_count;

  return v_filas > 0;
end;
$$;

-- Límite de frecuencia de las escrituras a Mercado Pago (cancelar): true si puede seguir, false si hubo otra hace
-- menos de p_min_seg segundos para esa persona.
create or replace function public.reclamar_escritura_mp_vita_plus(
  p_usuario uuid,
  p_suscripcion uuid,
  p_min_seg int
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_usuario is null or p_suscripcion is null or p_min_seg is null or p_min_seg < 0 or p_min_seg > 3600 then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vita_plus:' || p_usuario::text, 0));

  if not exists (
    select 1 from public.vita_plus_suscripciones s where s.id = p_suscripcion and s.usuario_id = p_usuario
  ) then
    return false;
  end if;
  if exists (
    select 1 from public.vita_plus_suscripciones s
    where s.usuario_id = p_usuario and s.ultima_escritura_mp_at > now() - make_interval(secs => p_min_seg)
  ) then
    return false;
  end if;
  update public.vita_plus_suscripciones s set ultima_escritura_mp_at = now() where s.id = p_suscripcion;
  return true;
end;
$$;

-- Anota un cobro (o evento) que no se acreditó. Idempotente por `clave`. Devuelve true si la fila quedó escrita
-- (nueva o ya existente); si falla, el webhook responde 5xx para que Mercado Pago reintente.
create or replace function public.anotar_pago_no_acreditado_vita_plus(
  p_clave text,
  p_pago_id text,
  p_preapproval_id text,
  p_external_reference text,
  p_motivo text,
  p_monto numeric,
  p_moneda text,
  p_estado_mp text,
  p_usuario uuid default null,
  p_suscripcion uuid default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_clave is null or p_motivo is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.vita_plus_pagos_no_acreditados
    (clave, pago_id, preapproval_id, external_reference, motivo, monto, moneda, estado_mp, usuario_id, suscripcion_id)
  values (p_clave, p_pago_id, p_preapproval_id, p_external_reference, p_motivo, p_monto, p_moneda, p_estado_mp, p_usuario, p_suscripcion)
  on conflict (clave) do nothing;
  return true;
end;
$$;

-- Botón de arrepentimiento: registra el pedido de revocación de la suscripción cuyo PRIMER cobro fue hace menos
-- de 10 días. Idempotente: un segundo pedido devuelve la misma suscripción con vp_nueva = false (así se puede
-- reintentar la cancelación en Mercado Pago sin duplicar el pedido). 'not_eligible' si no corresponde.
create or replace function public.solicitar_arrepentimiento_vita_plus(p_usuario uuid)
returns table (vp_suscripcion uuid, vp_nueva boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
  v_filas int;
begin
  if p_usuario is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vita_plus:' || p_usuario::text, 0));

  select p.suscripcion_id into v_sub
  from public.vita_plus_pagos p
  where p.usuario_id = p_usuario
    and p.creado_at > now() - interval '10 days'
    and not exists (select 1 from public.vita_plus_pagos q where q.suscripcion_id = p.suscripcion_id and q.creado_at < p.creado_at)
  order by p.creado_at desc
  limit 1;

  if v_sub is null then
    raise exception 'not_eligible' using errcode = '54000';
  end if;

  insert into public.vita_plus_arrepentimientos (usuario_id, suscripcion_id)
  values (p_usuario, v_sub)
  on conflict (suscripcion_id) do nothing;
  get diagnostics v_filas = row_count;

  return query select v_sub, v_filas > 0;
end;
$$;

-- Grants -------------------------------------------------------------------------------------------

revoke execute on function
  public.iniciar_suscripcion_vita_plus(uuid, text, text, int, int, numeric, int),
  public.registrar_pago_vita_plus(uuid, text, uuid, int),
  public.actualizar_estado_suscripcion_vita_plus(uuid, text, text),
  public.reclamar_escritura_mp_vita_plus(uuid, uuid, int),
  public.anotar_pago_no_acreditado_vita_plus(text, text, text, text, text, numeric, text, text, uuid, uuid),
  public.solicitar_arrepentimiento_vita_plus(uuid)
from public, anon, authenticated;
grant execute on function
  public.iniciar_suscripcion_vita_plus(uuid, text, text, int, int, numeric, int),
  public.registrar_pago_vita_plus(uuid, text, uuid, int),
  public.actualizar_estado_suscripcion_vita_plus(uuid, text, text),
  public.reclamar_escritura_mp_vita_plus(uuid, uuid, int),
  public.anotar_pago_no_acreditado_vita_plus(text, text, text, text, text, numeric, text, text, uuid, uuid),
  public.solicitar_arrepentimiento_vita_plus(uuid)
to service_role;

revoke execute on function public.mi_estado_vita_plus(), public.vita_plus_activo() from public, anon;
grant execute on function public.mi_estado_vita_plus(), public.vita_plus_activo() to authenticated, service_role;
