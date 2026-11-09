-- 054: invitación de cuidador con código de 6 dígitos y entrada con código por mail.
--
-- El código va en `vinculos_cuidador.codigo`, la misma columna de los vínculos
-- que inicia un cuidador, con su índice único entre pendientes. No se cruzan:
-- `reclamar_vinculo_como_elder` y el login por código exigen `elder_id is null`,
-- y acá `elder_id` siempre está. Solo con el código no se entra a nada: hay que
-- probar que el mail invitado es propio (código a esa casilla o Google).
--
-- `invitado_por` es quien mandó la invitación; null en las anteriores a esta.
--
-- Aplicar con `psql -1` y registrar en schema_migrations. Sin ella las
-- invitaciones siguen saliendo con el link largo.

alter table vinculos_cuidador add column if not exists invitado_por uuid references auth.users(id) on delete set null;

-- Asigna un código nuevo a una invitación pendiente. Reintenta si choca.
create or replace function asignar_codigo_invitacion(p_vinculo uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
begin
  for i in 1..12 loop
    -- gen_random_uuid es aleatorio fuerte; los primeros 8 hex no tienen bits fijos.
    v_codigo := (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 900000 + 100000)::text;
    begin
      update vinculos_cuidador set codigo = v_codigo where id = p_vinculo and estado = 'pendiente' and elder_id is not null;
      if not found then
        return null;
      end if;
      return v_codigo;
    exception when unique_violation then
      null;
    end;
  end loop;
  return null;
end;
$$;

revoke execute on function asignar_codigo_invitacion(uuid) from public, anon, authenticated;
grant execute on function asignar_codigo_invitacion(uuid) to service_role;

-- Cambia el tipo de retorno: hay que recrearla (misma lógica que 027).
drop function if exists invitar_cuidador(uuid, text, text, text, text);

create function invitar_cuidador(
  p_elder uuid,
  p_email text,
  p_nombre text,
  p_relacion text,
  p_rol text
)
returns table (vinculo_id uuid, token text, expira_at timestamptz, codigo text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nombre text := nullif(left(btrim(coalesce(p_nombre, '')), 60), '');
  v_relacion text := nullif(left(btrim(coalesce(p_relacion, '')), 30), '');
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  if not puede_gestionar_cuidadores(p_elder) then
    raise exception 'sin_permiso';
  end if;
  if p_rol is null or p_rol not in ('editar', 'ver') then
    raise exception 'rol_invalido';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$' then
    raise exception 'email_invalido';
  end if;
  if exists (
    select 1
    from vinculos_cuidador vc
    join auth.users u on u.id = vc.cuidador_id
    where vc.elder_id = p_elder and vc.estado = 'aceptado' and lower(u.email) = v_email
  ) then
    raise exception 'ya_es_cuidador';
  end if;
  if exists (select 1 from auth.users u where u.id = p_elder and lower(u.email) = v_email) then
    raise exception 'ya_es_cuidador';
  end if;

  select vc.id into v_id
  from vinculos_cuidador vc
  where vc.elder_id = p_elder
    and vc.estado = 'pendiente'
    and vc.cuidador_id is null
    and lower(vc.email_invitado) = v_email
  limit 1;

  if v_id is not null then
    update vinculos_cuidador vc
    set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        expira_at = now() + interval '7 days',
        rol = p_rol,
        relacion = v_relacion,
        nombre_invitado = v_nombre,
        invitado_por = auth.uid()
    where vc.id = v_id;
  else
    insert into vinculos_cuidador (elder_id, email_invitado, rol, relacion, nombre_invitado, invitado_por)
    values (p_elder, v_email, p_rol, v_relacion, v_nombre, auth.uid())
    returning id into v_id;
  end if;

  perform asignar_codigo_invitacion(v_id);

  return query
  select vc.id as vinculo_id, vc.token as token, vc.expira_at as expira_at, vc.codigo as codigo
  from vinculos_cuidador vc
  where vc.id = v_id;
end;
$$;

revoke execute on function invitar_cuidador(uuid, text, text, text, text) from public, anon;
grant execute on function invitar_cuidador(uuid, text, text, text, text) to authenticated;

-- Código de una invitación pendiente, para reenviarla. Las anteriores a esta
-- migración reciben uno la primera vez.
create or replace function codigo_de_invitacion(p_vinculo uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_codigo text;
begin
  select vc.elder_id, vc.codigo into v_elder, v_codigo
  from vinculos_cuidador vc
  where vc.id = p_vinculo and vc.estado = 'pendiente' and vc.elder_id is not null;
  if v_elder is null or not puede_gestionar_cuidadores(v_elder) then
    return null;
  end if;
  return coalesce(v_codigo, asignar_codigo_invitacion(p_vinculo));
end;
$$;

revoke execute on function codigo_de_invitacion(uuid) from public, anon;
grant execute on function codigo_de_invitacion(uuid) to authenticated;

-- Código de un solo uso mandado a la casilla invitada. Solo service_role:
-- quien lo usa todavía no tiene sesión. Se guarda el HMAC, nunca el código.
create table codigos_mail_invitacion (
  vinculo_id uuid primary key references vinculos_cuidador(id) on delete cascade,
  hash text not null,
  intentos int not null default 0,
  expira_at timestamptz not null,
  enviado_at timestamptz not null default now()
);

alter table codigos_mail_invitacion enable row level security;

-- Eventos de envío y de verificación fallida POR MAIL (normalizado), sumando
-- todas las invitaciones: reenviar o pedir otra invitación no reinicia el tope.
-- Solo service_role (RLS sin policies).
create table limites_mail_invitacion (
  id bigint generated always as identity primary key,
  email text not null,
  tipo text not null check (tipo in ('envio', 'fallo')),
  creado_at timestamptz not null default now()
);

create index limites_mail_invitacion_email_idx on limites_mail_invitacion (email, tipo, creado_at desc);

alter table limites_mail_invitacion enable row level security;

-- 'ok' | 'espera' (menos de 1 min del anterior) | 'tope' (5 por hora por mail,
-- sumando todas las invitaciones de esa casilla).
create or replace function guardar_codigo_mail_invitacion(p_vinculo uuid, p_hash text, p_email text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f codigos_mail_invitacion%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return 'tope';
  end if;
  -- Serializa por mail para que el conteo no se pase con pedidos simultáneos.
  perform pg_advisory_xact_lock(hashtext('limites_mail_invitacion:' || v_email));
  delete from limites_mail_invitacion where creado_at < now() - interval '1 day';

  if (select count(*) from limites_mail_invitacion
      where email = v_email and tipo = 'envio' and creado_at > now() - interval '1 hour') >= 5 then
    return 'tope';
  end if;

  select * into f from codigos_mail_invitacion where vinculo_id = p_vinculo for update;
  if not found then
    begin
      insert into codigos_mail_invitacion (vinculo_id, hash, expira_at)
      values (p_vinculo, p_hash, now() + interval '10 minutes');
    exception when unique_violation then
      return 'espera';
    end;
  else
    if f.enviado_at > now() - interval '1 minute' then
      return 'espera';
    end if;
    -- Los intentos fallidos no se limpian acá: cuentan en limites_mail_invitacion.
    update codigos_mail_invitacion
    set hash = p_hash,
        intentos = 0,
        expira_at = now() + interval '10 minutes',
        enviado_at = now()
    where vinculo_id = p_vinculo;
  end if;
  insert into limites_mail_invitacion (email, tipo) values (v_email, 'envio');
  return 'ok';
end;
$$;

-- true solo si coincide, sigue vigente, quedan intentos (5 por código) y el mail
-- no pasó 10 fallos en la última hora (sumando todas sus invitaciones). NO
-- consume el código: se consume con consumir_codigo_mail_invitacion una vez que
-- la sesión se abrió. Un fallo se anota por mail, así que reenviar no lo limpia.
create or replace function verificar_codigo_mail_invitacion(p_vinculo uuid, p_hash text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f codigos_mail_invitacion%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('limites_mail_invitacion:' || v_email));
  delete from limites_mail_invitacion where creado_at < now() - interval '1 day';

  if (select count(*) from limites_mail_invitacion
      where email = v_email and tipo = 'fallo' and creado_at > now() - interval '1 hour') >= 10 then
    return false;
  end if;

  select * into f from codigos_mail_invitacion where vinculo_id = p_vinculo for update;
  if not found or f.expira_at < now() or f.intentos >= 5 then
    return false;
  end if;
  if f.hash <> p_hash then
    update codigos_mail_invitacion set intentos = intentos + 1 where vinculo_id = p_vinculo;
    insert into limites_mail_invitacion (email, tipo) values (v_email, 'fallo');
    return false;
  end if;
  return true;
end;
$$;

-- Consume el código (un solo uso). true solo para quien lo consume primero:
-- si dos pedidos pasaron la verificación a la vez, el segundo recibe false y
-- el llamador cierra la sesión que había abierto. Sin borrar la fila: el freno
-- de 1 por minuto sigue valiendo.
create or replace function consumir_codigo_mail_invitacion(p_vinculo uuid, p_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas int;
begin
  update codigos_mail_invitacion
  set expira_at = now() - interval '1 second'
  where vinculo_id = p_vinculo and hash = p_hash and expira_at >= now();
  get diagnostics v_filas = row_count;
  return v_filas = 1;
end;
$$;

revoke execute on function guardar_codigo_mail_invitacion(uuid, text, text) from public, anon, authenticated;
revoke execute on function verificar_codigo_mail_invitacion(uuid, text, text) from public, anon, authenticated;
revoke execute on function consumir_codigo_mail_invitacion(uuid, text) from public, anon, authenticated;
grant execute on function guardar_codigo_mail_invitacion(uuid, text, text) to service_role;
grant execute on function verificar_codigo_mail_invitacion(uuid, text, text) to service_role;
grant execute on function consumir_codigo_mail_invitacion(uuid, text) to service_role;
