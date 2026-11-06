-- Vitapp — límite diario de interacciones (consultas) con vita, por usuario.
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- Requiere 046 (admin_acciones).
--
-- Decisión del dueño (2026-11-06): cada persona puede hacerle hasta 15 consultas por día a vita (el chat),
-- también con vita+. El día es el calendario de Argentina (la app pasa la fecha AR; igual que uso_ia_diario).
-- Un administrador puede subir o bajar el límite de una persona (1 a 1000); sin fila = límite general (15,
-- constante en el código: LIMITE_INTERACCIONES_DIARIO_DEFAULT en lib/uso-ia/interacciones-logica.ts).
-- Es un tope ADICIONAL al límite diario en dólares (013/036).
--
-- Tablas con RLS activada y SIN policies: solo service_role (contabilidad de sistema; si el usuario pudiera
-- escribirlas, se resetearía su propio contador). Funciones SECURITY DEFINER con search_path vacío, solo service_role.
-- Convenciones del repo: `returns table` con columnas prefijadas, idempotente.
-- Rollback:
--   drop function if exists public.consumir_interaccion(uuid, date, int), public.interacciones_hoy(uuid, date, int),
--     public.admin_interacciones(uuid[], date, int), public.admin_definir_limite_interacciones(uuid, int, text, text),
--     public.admin_usuarios_en_limite(date, int);
--   drop table if exists public.interacciones_diarias, public.limites_interacciones;

do $$
begin
  if to_regclass('public.admin_acciones') is null then
    raise exception 'limite_interacciones: falta la migración 046 (admin_acciones)';
  end if;
end;
$$;

create table if not exists public.interacciones_diarias (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  cuenta int not null default 0 check (cuenta >= 0),
  updated_at timestamptz not null default now(),
  primary key (usuario_id, fecha)
);

alter table public.interacciones_diarias enable row level security;
revoke all on table public.interacciones_diarias from public, anon, authenticated;
grant select, insert, update on table public.interacciones_diarias to service_role;

create table if not exists public.limites_interacciones (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  limite_diario int not null check (limite_diario between 1 and 1000),
  definido_por text not null check (char_length(definido_por) between 3 and 320),
  motivo text not null default '' check (char_length(motivo) <= 200),
  updated_at timestamptz not null default now()
);

alter table public.limites_interacciones enable row level security;
revoke all on table public.limites_interacciones from public, anon, authenticated;
grant select, insert, update, delete on table public.limites_interacciones to service_role;

-- Consumo atómico: suma 1 SOLO si todavía hay cupo (una sola sentencia: sin carrera entre leer y escribir).
-- Si ya llegó al tope no suma (el contador no pasa del límite). p_limite = límite general (el override de la
-- persona, si existe, manda). Devuelve si se permite, cuántas lleva y cuál es su límite.
create or replace function public.consumir_interaccion(p_usuario uuid, p_fecha date, p_limite int default 15)
returns table (c_permitido boolean, c_usadas int, c_limite int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int;
  v_cuenta int;
begin
  select coalesce(
    (select l.limite_diario from public.limites_interacciones l where l.usuario_id = p_usuario),
    p_limite
  ) into v_limite;
  if v_limite is null or v_limite < 1 then
    return query select false, 0, 0;
    return;
  end if;

  insert into public.interacciones_diarias as i (usuario_id, fecha, cuenta)
  values (p_usuario, p_fecha, 1)
  on conflict (usuario_id, fecha) do update
    set cuenta = i.cuenta + 1, updated_at = now()
    where i.cuenta < v_limite
  returning i.cuenta into v_cuenta;

  if v_cuenta is not null then
    return query select true, v_cuenta, v_limite;
    return;
  end if;

  select i.cuenta into v_cuenta from public.interacciones_diarias i where i.usuario_id = p_usuario and i.fecha = p_fecha;
  return query select false, coalesce(v_cuenta, 0), v_limite;
end;
$$;

-- Lectura sin consumir (Perfil, indicador del chat).
create or replace function public.interacciones_hoy(p_usuario uuid, p_fecha date, p_limite int default 15)
returns table (h_usadas int, h_limite int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select i.cuenta from public.interacciones_diarias i where i.usuario_id = p_usuario and i.fecha = p_fecha), 0),
    coalesce((select l.limite_diario from public.limites_interacciones l where l.usuario_id = p_usuario), p_limite);
$$;

-- Panel: uso de hoy y límite efectivo de varias personas a la vez (la lista de usuarios).
create or replace function public.admin_interacciones(p_ids uuid[], p_fecha date, p_limite int default 15)
returns table (a_usuario_id uuid, a_usadas int, a_limite int, a_personalizado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(i.cuenta, 0),
    coalesce(l.limite_diario, p_limite),
    l.usuario_id is not null
  from unnest(coalesce(p_ids, '{}'::uuid[])) as u(id)
  left join public.interacciones_diarias i on i.usuario_id = u.id and i.fecha = p_fecha
  left join public.limites_interacciones l on l.usuario_id = u.id;
$$;

-- Panel: fija el límite diario de una persona (p_limite null = volver al general). Devuelve 'ok' | 'invalido' |
-- 'no_existe' y el límite anterior (null si no tenía uno propio) para la auditoría.
create or replace function public.admin_definir_limite_interacciones(p_usuario uuid, p_limite int, p_por text, p_motivo text)
returns table (d_resultado text, d_anterior int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior int;
  v_por text := lower(btrim(coalesce(p_por, '')));
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if p_usuario is null or char_length(v_por) < 3 or char_length(v_motivo) > 200
     or (p_limite is not null and (p_limite < 1 or p_limite > 1000)) then
    return query select 'invalido'::text, null::int;
    return;
  end if;
  if not exists (select 1 from auth.users u where u.id = p_usuario) then
    return query select 'no_existe'::text, null::int;
    return;
  end if;
  select l.limite_diario into v_anterior from public.limites_interacciones l where l.usuario_id = p_usuario;
  if p_limite is null then
    delete from public.limites_interacciones l where l.usuario_id = p_usuario;
  else
    insert into public.limites_interacciones as l (usuario_id, limite_diario, definido_por, motivo)
    values (p_usuario, p_limite, v_por, v_motivo)
    on conflict (usuario_id) do update
      set limite_diario = excluded.limite_diario, definido_por = excluded.definido_por,
          motivo = excluded.motivo, updated_at = now();
  end if;
  return query select 'ok'::text, v_anterior;
end;
$$;

-- Panel (resumen): cuántas personas llegaron hoy a su límite.
create or replace function public.admin_usuarios_en_limite(p_fecha date, p_limite int default 15)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.interacciones_diarias i
  left join public.limites_interacciones l on l.usuario_id = i.usuario_id
  where i.fecha = p_fecha and i.cuenta >= coalesce(l.limite_diario, p_limite);
$$;

revoke all on function public.consumir_interaccion(uuid, date, int) from public, anon, authenticated;
revoke all on function public.interacciones_hoy(uuid, date, int) from public, anon, authenticated;
revoke all on function public.admin_interacciones(uuid[], date, int) from public, anon, authenticated;
revoke all on function public.admin_definir_limite_interacciones(uuid, int, text, text) from public, anon, authenticated;
revoke all on function public.admin_usuarios_en_limite(date, int) from public, anon, authenticated;
grant execute on function public.consumir_interaccion(uuid, date, int) to service_role;
grant execute on function public.interacciones_hoy(uuid, date, int) to service_role;
grant execute on function public.admin_interacciones(uuid[], date, int) to service_role;
grant execute on function public.admin_definir_limite_interacciones(uuid, int, text, text) to service_role;
grant execute on function public.admin_usuarios_en_limite(date, int) to service_role;
