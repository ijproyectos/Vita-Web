-- Vitapp — gestión del panel /adminvita: administradores, suspensión de cuentas y envíos masivos.
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- Requiere las migraciones 017 (push_suscripciones), 020 (avisos), 035 (limites_pedidos), 045 y 046 (panel y auditoría).
--
-- Decisiones del dueño (2026-11-01):
--   * ADMINISTRADORES. Los emails de la variable ADMIN_EMAILS son DUEÑOS permanentes (no se pueden quitar desde el
--     panel y solo ellos otorgan o revocan accesos). La tabla `administradores` guarda los administradores que
--     agregan los dueños desde el panel. RLS activada SIN policies: solo service_role. Revocar escribe además
--     `admin_2fa_revocaciones` para que la sesión del panel de esa persona muera de inmediato.
--   * SUSPENSIÓN DE CUENTAS (mal uso o falta de pago). `suspensiones` guarda motivo, nota interna (<= 300), quién
--     suspendió y quién levantó. Una sola suspensión activa por cuenta (índice único parcial). La persona suspendida
--     puede LEER su propia suspensión activa (para mostrarle el aviso), pero no la nota interna ni quién la hizo
--     (permisos por columna). Complementa el ban de Supabase Auth que aplica el servidor. NO borra ni altera datos.
--   * ENVÍOS MASIVOS de push. `envios_masivos` es una cola: el cron `dosis-vencidas` reclama de a lotes con
--     `reclamar_lote_envio_masivo` (for update skip locked: dos ticks superpuestos no procesan el mismo lote). El
--     cursor es el último usuario procesado, ordenado por id. Un envío cada 10 minutos en total.
--   * Funciones SECURITY DEFINER con search_path vacío, ejecutables SOLO por service_role (salvo `mi_suspension`, que
--     solo devuelve la suspensión del propio llamador). `admin_usuarios` se redefine para exponer la suspensión y el
--     filtro "suspendidos" (la 046 no se toca).
-- Convenciones del repo: `returns table` con columnas prefijadas, idempotente.
-- Rollback:
--   drop function if exists public.mi_suspension(), public.admin_suspensiones_de(uuid),
--     public.admin_suspender_usuario(uuid, text, text, text), public.admin_reactivar_usuario(uuid, text),
--     public.admin_es_administrador(text), public.admin_agregar_administrador(text, text),
--     public.admin_revocar_administrador(text), public.crear_envio_masivo(text, text, text, text),
--     public.reclamar_lote_envio_masivo(int), public.registrar_progreso_envio_masivo(uuid, int, int, int),
--     public.cancelar_envio_masivo(uuid, text), public.admin_destinatarios_masivos();
--   drop table if exists public.envios_masivos, public.suspensiones, public.administradores;
--   y re-crear admin_usuarios desde la 046.

do $$
begin
  if to_regclass('public.admin_acciones') is null or to_regclass('public.admin_2fa_revocaciones') is null
     or to_regclass('public.push_suscripciones') is null or to_regclass('public.avisos') is null then
    raise exception 'admin_gestion: faltan las migraciones 017, 020, 045 y/o 046';
  end if;
end;
$$;

-- Administradores -----------------------------------------------------------------------------------------

create table if not exists public.administradores (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 3 and 320 and email = lower(email)),
  agregado_por text not null check (char_length(agregado_por) between 3 and 320),
  created_at timestamptz not null default now(),
  revocado_at timestamptz
);

alter table public.administradores enable row level security;
revoke all on table public.administradores from public, anon, authenticated;
grant select, insert, update on table public.administradores to service_role;

-- Suspensiones --------------------------------------------------------------------------------------------

create table if not exists public.suspensiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  motivo text not null check (motivo in ('mal_uso', 'falta_de_pago')),
  nota text not null default '' check (char_length(nota) <= 300),
  suspendido_por text not null check (char_length(suspendido_por) between 3 and 320),
  created_at timestamptz not null default now(),
  levantada_at timestamptz,
  levantada_por text check (levantada_por is null or char_length(levantada_por) between 3 and 320)
);

create unique index if not exists idx_suspensiones_activa on public.suspensiones (usuario_id) where levantada_at is null;
create index if not exists idx_suspensiones_usuario on public.suspensiones (usuario_id, created_at desc);

alter table public.suspensiones enable row level security;

drop policy if exists suspensiones_select_propia on public.suspensiones;
create policy suspensiones_select_propia on public.suspensiones
  for select to authenticated
  using (usuario_id = (select auth.uid()) and levantada_at is null);

revoke all on table public.suspensiones from public, anon, authenticated;
-- La nota interna y quién suspendió NO se exponen a la persona suspendida: solo estas columnas.
grant select (id, usuario_id, motivo, created_at, levantada_at) on table public.suspensiones to authenticated;
grant select, insert, update on table public.suspensiones to service_role;

-- Envíos masivos ------------------------------------------------------------------------------------------

create table if not exists public.envios_masivos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 1 and 60),
  cuerpo text not null check (char_length(cuerpo) between 1 and 180),
  enlace text not null check (char_length(enlace) between 4 and 200),
  creado_por text not null check (char_length(creado_por) between 3 and 320),
  created_at timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'terminado', 'cancelado')),
  total_usuarios int not null default 0 check (total_usuarios >= 0),
  total_dispositivos int not null default 0 check (total_dispositivos >= 0),
  usuarios_procesados int not null default 0 check (usuarios_procesados >= 0),
  enviados int not null default 0 check (enviados >= 0),
  fallidos int not null default 0 check (fallidos >= 0),
  cursor_usuario uuid,
  iniciado_at timestamptz,
  terminado_at timestamptz,
  cancelado_at timestamptz,
  cancelado_por text
);

create index if not exists idx_envios_masivos_estado on public.envios_masivos (estado, created_at);
create index if not exists idx_envios_masivos_creado on public.envios_masivos (created_at desc);

alter table public.envios_masivos enable row level security;
revoke all on table public.envios_masivos from public, anon, authenticated;
grant select, insert, update on table public.envios_masivos to service_role;

-- Administradores: funciones -----------------------------------------------------------------------------

create or replace function public.admin_es_administrador(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a
    where a.email = lower(btrim(coalesce(p_email, ''))) and a.revocado_at is null
  );
$$;

-- 'ok' | 'ya_activo' | 'invalido'. Volver a agregar a alguien revocado lo reactiva.
create or replace function public.admin_agregar_administrador(p_email text, p_por text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_por text := lower(btrim(coalesce(p_por, '')));
  v_n int;
begin
  if char_length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_por) < 3 then
    return 'invalido';
  end if;
  insert into public.administradores as a (email, agregado_por)
  values (v_email, v_por)
  on conflict (email) do update
    set revocado_at = null, agregado_por = excluded.agregado_por, created_at = now()
    where a.revocado_at is not null;
  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'ya_activo' else 'ok' end;
end;
$$;

-- Revoca y mata la sesión del panel de esa persona (las cookies del segundo factor anteriores a ahora dejan de valer).
create or replace function public.admin_revocar_administrador(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_n int;
begin
  update public.administradores a set revocado_at = now() where a.email = v_email and a.revocado_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into public.admin_2fa_revocaciones as r (admin_email, revocado_desde)
  values (v_email, now())
  on conflict (admin_email) do update set revocado_desde = excluded.revocado_desde;
  return true;
end;
$$;

-- Suspensiones: funciones --------------------------------------------------------------------------------

-- 'ok' | 'ya_suspendida' | 'no_existe' | 'protegida' | 'motivo_invalido' | 'nota_larga'.
-- 'protegida' = la cuenta es de un administrador activo (los dueños de ADMIN_EMAILS los frena el servidor).
create or replace function public.admin_suspender_usuario(p_usuario uuid, p_motivo text, p_nota text, p_por text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_nota text := btrim(coalesce(p_nota, ''));
begin
  if p_motivo is null or p_motivo not in ('mal_uso', 'falta_de_pago') then
    return 'motivo_invalido';
  end if;
  if char_length(v_nota) > 300 then
    return 'nota_larga';
  end if;
  select lower(u.email::text) into v_email from auth.users u where u.id = p_usuario and u.deleted_at is null;
  if not found then
    return 'no_existe';
  end if;
  if v_email is not null and public.admin_es_administrador(v_email) then
    return 'protegida';
  end if;
  begin
    insert into public.suspensiones (usuario_id, motivo, nota, suspendido_por)
    values (p_usuario, p_motivo, v_nota, lower(btrim(coalesce(p_por, ''))));
  exception when unique_violation then
    return 'ya_suspendida';
  end;
  return 'ok';
end;
$$;

create or replace function public.admin_reactivar_usuario(p_usuario uuid, p_por text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.suspensiones s
     set levantada_at = now(), levantada_por = lower(btrim(coalesce(p_por, '')))
   where s.usuario_id = p_usuario and s.levantada_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

create or replace function public.admin_suspensiones_de(p_usuario uuid)
returns table (
  o_id uuid,
  o_motivo text,
  o_nota text,
  o_suspendido_por text,
  o_creada timestamptz,
  o_levantada timestamptz,
  o_levantada_por text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.motivo, s.nota, s.suspendido_por, s.created_at, s.levantada_at, s.levantada_por
  from public.suspensiones s
  where s.usuario_id = p_usuario
  order by s.created_at desc
  limit 50;
$$;

-- Lectura de la sesión: SOLO la suspensión activa de quien llama (no la nota ni quién suspendió).
create or replace function public.mi_suspension()
returns table (ms_motivo text, ms_desde timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.motivo, s.created_at
  from public.suspensiones s
  where s.usuario_id = auth.uid() and s.levantada_at is null
  limit 1;
$$;

-- Envíos masivos: funciones ------------------------------------------------------------------------------

create or replace function public.admin_destinatarios_masivos()
returns table (o_usuarios bigint, o_dispositivos bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct s.usuario_id), count(*) from public.push_suscripciones s;
$$;

-- Crea el envío. Resultado: 'ok' | 'invalido' | 'en_curso' (hay otro pendiente o enviando) | 'limite' (hubo uno hace
-- menos de 10 minutos; cr_espera_seg dice cuánto falta) | 'sin_destinatarios'. Un envío cancelado SIN haber enviado nada
-- no cuenta para el límite; uno cancelado después de reclamar algún lote sí (si no, crear y cancelar saltaría la ventana).
create or replace function public.crear_envio_masivo(p_titulo text, p_cuerpo text, p_enlace text, p_por text)
returns table (cr_id uuid, cr_resultado text, cr_espera_seg int, cr_usuarios int, cr_dispositivos int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_cuerpo text := btrim(coalesce(p_cuerpo, ''));
  v_enlace text := btrim(coalesce(p_enlace, ''));
  v_ultimo timestamptz;
  v_usuarios int;
  v_dispositivos int;
  v_id uuid;
begin
  if char_length(v_titulo) not between 1 and 60 or char_length(v_cuerpo) not between 1 and 180
     or char_length(v_enlace) > 200 or v_enlace !~ '^/app([/?#][^[:space:]\\]*)?$'
     or position('//' in v_enlace) > 0 or position('..' in v_enlace) > 0
     or char_length(btrim(coalesce(p_por, ''))) < 3 then
    return query select null::uuid, 'invalido'::text, 0, 0, 0;
    return;
  end if;

  -- Serializa las altas: dos pedidos a la vez no pueden saltarse el límite.
  perform pg_advisory_xact_lock(hashtext('envios_masivos_alta'));

  if exists (select 1 from public.envios_masivos e where e.estado in ('pendiente', 'enviando')) then
    return query select null::uuid, 'en_curso'::text, 0, 0, 0;
    return;
  end if;

  select max(e.created_at) into v_ultimo from public.envios_masivos e
  where e.estado <> 'cancelado' or e.enviados > 0 or e.cursor_usuario is not null;
  if v_ultimo is not null and v_ultimo > now() - interval '10 minutes' then
    return query select null::uuid, 'limite'::text,
      ceil(extract(epoch from (v_ultimo + interval '10 minutes' - now())))::int, 0, 0;
    return;
  end if;

  select count(distinct s.usuario_id)::int, count(*)::int into v_usuarios, v_dispositivos from public.push_suscripciones s;
  if v_usuarios = 0 then
    return query select null::uuid, 'sin_destinatarios'::text, 0, 0, 0;
    return;
  end if;

  insert into public.envios_masivos (titulo, cuerpo, enlace, creado_por, total_usuarios, total_dispositivos)
  values (v_titulo, v_cuerpo, v_enlace, lower(btrim(p_por)), v_usuarios, v_dispositivos)
  returning id into v_id;

  return query select v_id, 'ok'::text, 0, v_usuarios, v_dispositivos;
end;
$$;

-- Reclama el siguiente lote del envío activo más antiguo (sin cuentas suspendidas). Atómico: bloquea la fila del envío con `skip locked` y
-- avanza el cursor en la misma transacción, así dos ticks superpuestos nunca reciben los mismos usuarios (si uno
-- cae después de reclamar, ese lote se pierde: preferimos no repetir un aviso). Sin usuarios que queden, termina
-- el envío y no devuelve filas.
create or replace function public.reclamar_lote_envio_masivo(p_limite int default 20)
returns table (lt_envio_id uuid, lt_titulo text, lt_cuerpo text, lt_enlace text, lt_usuarios uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_e public.envios_masivos%rowtype;
  v_usuarios uuid[];
begin
  select e.* into v_e
  from public.envios_masivos e
  where e.estado in ('pendiente', 'enviando')
  order by e.created_at
  limit 1
  for update skip locked;
  if not found then
    return;
  end if;

  select coalesce(array_agg(x.usuario_id order by x.usuario_id), '{}'::uuid[]) into v_usuarios
  from (
    select distinct s.usuario_id
    from public.push_suscripciones s
    where (v_e.cursor_usuario is null or s.usuario_id > v_e.cursor_usuario)
      -- Las cuentas suspendidas no reciben anuncios.
      and not exists (select 1 from public.suspensiones z where z.usuario_id = s.usuario_id and z.levantada_at is null)
    order by s.usuario_id
    limit v_limite
  ) x;

  if cardinality(v_usuarios) = 0 then
    update public.envios_masivos e set estado = 'terminado', terminado_at = now() where e.id = v_e.id;
    return;
  end if;

  update public.envios_masivos e
     set estado = 'enviando',
         iniciado_at = coalesce(e.iniciado_at, now()),
         cursor_usuario = v_usuarios[cardinality(v_usuarios)]
   where e.id = v_e.id;

  return query select v_e.id, v_e.titulo, v_e.cuerpo, v_e.enlace, v_usuarios;
end;
$$;

create or replace function public.registrar_progreso_envio_masivo(p_id uuid, p_usuarios int, p_enviados int, p_fallidos int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.envios_masivos e
     set usuarios_procesados = e.usuarios_procesados + greatest(coalesce(p_usuarios, 0), 0),
         enviados = e.enviados + greatest(coalesce(p_enviados, 0), 0),
         fallidos = e.fallidos + greatest(coalesce(p_fallidos, 0), 0)
   where e.id = p_id;
$$;

create or replace function public.cancelar_envio_masivo(p_id uuid, p_por text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.envios_masivos e
     set estado = 'cancelado', cancelado_at = now(), cancelado_por = lower(btrim(coalesce(p_por, '')))
   where e.id = p_id and e.estado in ('pendiente', 'enviando');
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- admin_usuarios con suspensión (la 046 queda como estaba) ------------------------------------------------

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
  o_onboarding boolean,
  o_suspendido boolean,
  o_suspension_motivo text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_q text := lower(btrim(coalesce(p_busqueda, '')));
  v_filtro text := case when p_filtro in ('vita_plus', 'vp_pago', 'vp_codigo_plus', 'vp_codigo_admin', 'inactivos_7', 'inactivos_30', 'gestionados', 'sin_onboarding', 'suspendidos')
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
           (sp.usuario_id is not null) as susp, sp.motivo as susp_motivo,
           vg.vence_at, coalesce(vg.permanente, false) as perm, vg.origen,
           case when a.o_ultima is null then null
                else (v_hoy - (a.o_ultima at time zone 'America/Argentina/Buenos_Aires')::date) end as dias
    from auth.users u
    left join public.perfiles p on p.id = u.id
    left join public.admin_actividad() a on a.o_usuario_id = u.id
    left join public.vita_plus_vigencia vg on vg.usuario_id = u.id
    left join public.suspensiones sp on sp.usuario_id = u.id and sp.levantada_at is null
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
            when 'suspendidos' then b.susp
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
    f.onb,
    f.susp,
    f.susp_motivo
  from filtrado f
  order by f.ultima desc nulls last, f.created_at desc;
end;
$$;

-- Permisos ------------------------------------------------------------------------------------------------

revoke all on function public.admin_es_administrador(text) from public, anon, authenticated;
revoke all on function public.admin_agregar_administrador(text, text) from public, anon, authenticated;
revoke all on function public.admin_revocar_administrador(text) from public, anon, authenticated;
revoke all on function public.admin_suspender_usuario(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_reactivar_usuario(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_suspensiones_de(uuid) from public, anon, authenticated;
revoke all on function public.admin_destinatarios_masivos() from public, anon, authenticated;
revoke all on function public.crear_envio_masivo(text, text, text, text) from public, anon, authenticated;
revoke all on function public.reclamar_lote_envio_masivo(int) from public, anon, authenticated;
revoke all on function public.registrar_progreso_envio_masivo(uuid, int, int, int) from public, anon, authenticated;
revoke all on function public.cancelar_envio_masivo(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_usuarios(text, text, int, int) from public, anon, authenticated;
revoke all on function public.mi_suspension() from public, anon;

grant execute on function public.admin_es_administrador(text) to service_role;
grant execute on function public.admin_agregar_administrador(text, text) to service_role;
grant execute on function public.admin_revocar_administrador(text) to service_role;
grant execute on function public.admin_suspender_usuario(uuid, text, text, text) to service_role;
grant execute on function public.admin_reactivar_usuario(uuid, text) to service_role;
grant execute on function public.admin_suspensiones_de(uuid) to service_role;
grant execute on function public.admin_destinatarios_masivos() to service_role;
grant execute on function public.crear_envio_masivo(text, text, text, text) to service_role;
grant execute on function public.reclamar_lote_envio_masivo(int) to service_role;
grant execute on function public.registrar_progreso_envio_masivo(uuid, int, int, int) to service_role;
grant execute on function public.cancelar_envio_masivo(uuid, text) to service_role;
grant execute on function public.admin_usuarios(text, text, int, int) to service_role;
grant execute on function public.mi_suspension() to authenticated, service_role;
