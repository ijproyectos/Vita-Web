-- Vitapp — fix real: `reclamar_invitacion_cuidador` y
-- `reclamar_vinculo_como_elder` fallaban en producción con "column
-- reference is ambiguous" apenas se los llamaba de verdad (reproducido
-- contra la DB real, no en teoría).
--
-- Causa: en PL/pgSQL, una función con `returns table (col1 tipo, ...)`
-- expone esos nombres de columna como variables OUT accesibles dentro
-- del cuerpo de la función. `reclamar_invitacion_cuidador` devuelve
-- `(elder_id, nombre)` y `reclamar_vinculo_como_elder` devuelve
-- `(cuidador_id, nombre)` — cualquier referencia SIN calificar a la
-- columna de `vinculos_cuidador` con el mismo nombre (`elder_id` /
-- `cuidador_id`) queda ambigua entre esa variable OUT y la columna de la
-- tabla. La migración 010 introdujo el bug al agregar
-- `and elder_id is not null` (sin calificar) a `reclamar_invitacion_cuidador`
-- — eso también rompió el flujo de invitación por link (dirección a),
-- que llevaba desde el PR3 sin ejercitarse de punta a punta.
--
-- Fix: calificar toda referencia a columnas de `vinculos_cuidador` con
-- un alias (`vc`) en ambas funciones. `create or replace` conserva
-- OID/grants/permisos — no hace falta volver a otorgar `execute`.

create or replace function reclamar_invitacion_cuidador(p_token text)
returns table (elder_id uuid, nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
  v_email text;
begin
  select * into v_vinculo
  from vinculos_cuidador vc
  where vc.token = p_token and vc.estado = 'pendiente' and vc.elder_id is not null
  for update;

  if not found then
    raise exception 'invitacion_no_encontrada';
  end if;

  if v_vinculo.expira_at < now() then
    raise exception 'invitacion_expirada';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if v_email is null or lower(v_email) <> lower(v_vinculo.email_invitado) then
    raise exception 'invitacion_no_corresponde_a_esta_cuenta';
  end if;

  update vinculos_cuidador
  set cuidador_id = auth.uid(), estado = 'aceptado', aceptado_at = now()
  where id = v_vinculo.id;

  return query
  select p.id as elder_id, p.nombre as nombre
  from perfiles p
  where p.id = v_vinculo.elder_id;
end;
$$;

create or replace function reclamar_vinculo_como_elder(p_codigo text)
returns table (cuidador_id uuid, nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
begin
  select * into v_vinculo
  from vinculos_cuidador vc
  where vc.codigo = p_codigo and vc.estado = 'pendiente' and vc.elder_id is null
  for update;

  if not found then
    raise exception 'codigo_no_encontrado';
  end if;

  if v_vinculo.expira_at < now() then
    raise exception 'codigo_expirado';
  end if;

  if exists (
    select 1 from vinculos_cuidador vc
    where vc.elder_id = auth.uid() and vc.cuidador_id = v_vinculo.cuidador_id and vc.estado = 'aceptado'
  ) then
    raise exception 'ya_vinculado';
  end if;

  update vinculos_cuidador
  set elder_id = auth.uid(), estado = 'aceptado', aceptado_at = now()
  where id = v_vinculo.id;

  return query
  select p.id as cuidador_id, p.nombre as nombre
  from perfiles p
  where p.id = v_vinculo.cuidador_id;
end;
$$;
