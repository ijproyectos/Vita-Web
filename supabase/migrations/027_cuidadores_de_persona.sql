-- 027 · Cuidadores de una persona (V7 "Familia y permisos")
--
-- Hasta 021 solo la persona cuidada veía a sus cuidadores (listar_mis_cuidadores)
-- y solo ella cambiaba permisos o revocaba. El diseño V7 pide además que un
-- cuidador Admin de un PERFIL GESTIONADO (una persona sin celular, creada por
-- él) vea "Quién la cuida", invite a otros y cambie/quite permisos. La RLS de
-- vinculos_cuidador no lo permite (el cuidador solo ve sus propias filas y no
-- puede escribir), así que todo pasa por RPCs security definer con chequeos
-- estrictos:
--
--   · Ver la lista: la propia persona o un cuidador ACEPTADO de ella.
--   · Gestionar (invitar, cambiar permiso, quitar): la propia persona, o un
--     cuidador con rol 'editar' (Admin) SOLO si la persona es un perfil
--     gestionado (auth.users.raw_app_meta_data.tipo = 'perfil_gestionado';
--     app_metadata, not user_metadata: clients can rewrite user_metadata).
--     Sobre una persona con cuenta propia decide únicamente ella.
--   · Nadie se cambia el permiso ni se quita a sí mismo por estas RPCs (para
--     salir está dejar_de_cuidar): evita dejar a un perfil gestionado sin Admin.
--
-- Cambios:
--   1. vinculos_cuidador.nombre_invitado (cómo el invitador llama a la persona
--      que invita; se muestra mientras la invitación está pendiente).
--   2. es_perfil_gestionado(uuid), puede_gestionar_cuidadores(uuid).
--   3. listar_cuidadores_de(p_elder): aceptados + invitaciones pendientes.
--   4. invitar_cuidador(...): crea/reemite una invitación (por mail o link)
--      guardando rol/relación/nombre; reemplaza al insert directo del elder.
--   5. cambiar_rol_cuidador(...): misma firma que 021, ahora con los permisos
--      de arriba y también sobre invitaciones pendientes.
--   6. quitar_cuidador(p_vinculo_id): revoca un vínculo (aceptado o pendiente)
--      de OTRA persona.
--
-- Convención del repo: las funciones `returns table` califican sus columnas con
-- alias (ver 011).

alter table vinculos_cuidador
  add column if not exists nombre_invitado text;

-- 2 · helpers ------------------------------------------------------------------

create or replace function es_perfil_gestionado(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'tipo' = 'perfil_gestionado' from auth.users u where u.id = p_id),
    false
  );
$$;

create or replace function puede_gestionar_cuidadores(p_elder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and p_elder is not null and (
    auth.uid() = p_elder
    or (puede_editar_de(p_elder) and es_perfil_gestionado(p_elder))
  );
$$;

revoke execute on function es_perfil_gestionado(uuid) from public, anon;
revoke execute on function puede_gestionar_cuidadores(uuid) from public, anon;
-- Internal helpers: only the security definer RPCs below call them.
revoke execute on function es_perfil_gestionado(uuid) from authenticated;
revoke execute on function puede_gestionar_cuidadores(uuid) from authenticated;

-- Managed-profile flag moves to app_metadata (not writable by clients).
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"tipo":"perfil_gestionado"}'::jsonb
where raw_user_meta_data ->> 'tipo' = 'perfil_gestionado';

-- A revoked link must not block re-inviting the same person (008's index
-- also covered revoked rows, so the claim failed with a duplicate key).
drop index if exists idx_vinculo_unico;
create unique index idx_vinculo_unico on vinculos_cuidador (elder_id, cuidador_id)
  where cuidador_id is not null and estado <> 'revocado';

-- One pending invitation per person and email (concurrent invitar_cuidador).
create unique index if not exists idx_vinculo_invitacion_pendiente
  on vinculos_cuidador (elder_id, lower(email_invitado))
  where estado = 'pendiente' and cuidador_id is null and elder_id is not null;

-- 3 · listar_cuidadores_de -----------------------------------------------------
-- Devuelve vacío si quien llama no es la persona ni uno de sus cuidadores
-- aceptados. Las invitaciones pendientes, los emails y los tokens solo se
-- devuelven a quien puede gestionar (puede_gestionar = true en todas las filas).

create or replace function listar_cuidadores_de(p_elder uuid)
returns table (
  vinculo_id uuid,
  cuidador_id uuid,
  nombre text,
  rol text,
  relacion text,
  estado text,
  es_yo boolean,
  puede_gestionar boolean,
  email text,
  token text,
  expira_at timestamptz,
  aceptado_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_gestiona boolean;
begin
  if auth.uid() is null or p_elder is null then
    return;
  end if;
  if not (auth.uid() = p_elder or es_cuidador_de(p_elder)) then
    return;
  end if;
  v_gestiona := puede_gestionar_cuidadores(p_elder);

  return query
  select
    vc.id as vinculo_id,
    vc.cuidador_id as cuidador_id,
    coalesce(nullif(btrim(p.nombre), ''), nullif(btrim(vc.nombre_invitado), '')) as nombre,
    vc.rol as rol,
    vc.relacion as relacion,
    vc.estado as estado,
    (vc.cuidador_id is not null and vc.cuidador_id = auth.uid()) as es_yo,
    v_gestiona as puede_gestionar,
    case
      when not v_gestiona then null
      when vc.estado = 'pendiente' then nullif(vc.email_invitado, '')
      else u.email::text
    end as email,
    case when v_gestiona and vc.estado = 'pendiente' then vc.token else null end as token,
    vc.expira_at as expira_at,
    vc.aceptado_at as aceptado_at
  from vinculos_cuidador vc
  left join perfiles p on p.id = vc.cuidador_id
  left join auth.users u on u.id = vc.cuidador_id
  where vc.elder_id = p_elder
    and (
      (vc.estado = 'aceptado' and vc.cuidador_id is not null and vc.cuidador_id <> vc.elder_id)
      or (vc.estado = 'pendiente' and vc.cuidador_id is null and vc.expira_at > now() and v_gestiona)
    )
  order by (vc.estado = 'aceptado') desc, vc.aceptado_at nulls last, vc.created_at;
end;
$$;

-- 4 · invitar_cuidador ---------------------------------------------------------
-- Crea (o reemite, si ya había una pendiente al mismo email) una invitación
-- para que alguien cuide a p_elder. El claim sigue siendo
-- reclamar_invitacion_cuidador (008): token + email de la cuenta. Devuelve el
-- token para armar el link (mail, WhatsApp, copiar).

create or replace function invitar_cuidador(
  p_elder uuid,
  p_email text,
  p_nombre text,
  p_relacion text,
  p_rol text
)
returns table (vinculo_id uuid, token text, expira_at timestamptz)
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
  -- Ya la cuida alguien con ese email.
  if exists (
    select 1
    from vinculos_cuidador vc
    join auth.users u on u.id = vc.cuidador_id
    where vc.elder_id = p_elder and vc.estado = 'aceptado' and lower(u.email) = v_email
  ) then
    raise exception 'ya_es_cuidador';
  end if;
  -- No se invita a la propia persona a cuidarse a sí misma.
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
    -- gen_random_uuid is core Postgres; pgcrypto lives in `extensions`, which is
    -- not on this function's search_path.
    set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        expira_at = now() + interval '7 days',
        rol = p_rol,
        relacion = v_relacion,
        nombre_invitado = v_nombre
    where vc.id = v_id;
  else
    insert into vinculos_cuidador (elder_id, email_invitado, rol, relacion, nombre_invitado)
    values (p_elder, v_email, p_rol, v_relacion, v_nombre)
    returning id into v_id;
  end if;

  return query
  select vc.id as vinculo_id, vc.token as token, vc.expira_at as expira_at
  from vinculos_cuidador vc
  where vc.id = v_id;
end;
$$;

-- 5 · cambiar_rol_cuidador (misma firma que 021) --------------------------------

create or replace function cambiar_rol_cuidador(p_vinculo_id uuid, p_rol text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;
  if p_rol is null or p_rol not in ('editar', 'ver') then
    raise exception 'rol_invalido';
  end if;

  select * into v_vinculo from vinculos_cuidador vc where vc.id = p_vinculo_id;
  if not found or v_vinculo.elder_id is null or v_vinculo.estado not in ('aceptado', 'pendiente') then
    return false;
  end if;
  if not puede_gestionar_cuidadores(v_vinculo.elder_id) then
    return false;
  end if;
  -- Un cuidador no se cambia su propio permiso (evita dejar al perfil sin Admin).
  if v_vinculo.cuidador_id is not null and v_vinculo.cuidador_id = auth.uid() and auth.uid() <> v_vinculo.elder_id then
    return false;
  end if;

  update vinculos_cuidador vc set rol = p_rol where vc.id = p_vinculo_id;
  return found;
end;
$$;

-- 6 · quitar_cuidador ----------------------------------------------------------
-- Revoca el vínculo de OTRA persona (o cancela una invitación pendiente).
-- Para dejar de cuidar uno mismo está dejar_de_cuidar (021).

create or replace function quitar_cuidador(p_vinculo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  select * into v_vinculo from vinculos_cuidador vc where vc.id = p_vinculo_id;
  if not found or v_vinculo.elder_id is null or v_vinculo.estado not in ('aceptado', 'pendiente') then
    return false;
  end if;
  if not puede_gestionar_cuidadores(v_vinculo.elder_id) then
    return false;
  end if;
  if v_vinculo.cuidador_id is not null and v_vinculo.cuidador_id = auth.uid() and auth.uid() <> v_vinculo.elder_id then
    return false;
  end if;

  update vinculos_cuidador vc set estado = 'revocado' where vc.id = p_vinculo_id;
  return found;
end;
$$;

revoke execute on function listar_cuidadores_de(uuid) from public, anon;
revoke execute on function invitar_cuidador(uuid, text, text, text, text) from public, anon;
revoke execute on function cambiar_rol_cuidador(uuid, text) from public, anon;
revoke execute on function quitar_cuidador(uuid) from public, anon;
grant execute on function listar_cuidadores_de(uuid) to authenticated;
grant execute on function invitar_cuidador(uuid, text, text, text, text) to authenticated;
grant execute on function cambiar_rol_cuidador(uuid, text) to authenticated;
grant execute on function quitar_cuidador(uuid) to authenticated;
