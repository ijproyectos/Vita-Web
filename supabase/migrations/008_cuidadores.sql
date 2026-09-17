-- Vitapp — Modo Cuidador: vínculo elder↔cuidador de solo lectura.
-- Un elder invita a un cuidador por email; el cuidador reclama la invitación
-- mediante una RPC `security definer` (la fila pendiente tiene `cuidador_id
-- is null` y `elder_id <> auth.uid()`, así que ninguna policy propia del
-- cuidador podría verla ni actualizarla). Una vez `estado = 'aceptado'`, dos
-- policies `for select` adicionales (aditivas, NO reemplazan `_all_self`)
-- le dan al cuidador lectura de `medicamentos`/`medicamentos_tomas` del
-- elder vinculado. `perfiles` NO recibe ninguna policy nueva — el nombre
-- del elder se expone solo a través de `listar_elders_vinculados()`, que
-- devuelve exactamente `(elder_id, nombre)` y nada más (RLS es a nivel de
-- fila, no de columna; una policy de select en `perfiles` filtraría por
-- fila pero expondría columnas sensibles como `condiciones`/`alergias`/
-- `peso_kg`/`obra_social`).
--
-- `alertas_dosis` es el log/dedupe de las alertas de dosis vencida (Fase 3,
-- fuera de esta migración su llenado) — sin policies propias, solo
-- accesible vía `service_role` desde el cron route.

create table vinculos_cuidador (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references auth.users(id) on delete cascade,
  cuidador_id uuid references auth.users(id) on delete cascade, -- null hasta el claim
  email_invitado text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  estado text not null check (estado in ('pendiente', 'aceptado', 'revocado')) default 'pendiente',
  expira_at timestamptz not null default now() + interval '7 days',
  aceptado_at timestamptz,
  created_at timestamptz not null default now()
);

-- Un mismo par elder+cuidador no puede tener dos vínculos aceptados/activos
-- a la vez (una vez reclamado). Antes del claim, `cuidador_id` es null y
-- esta unicidad no aplica (permite reinvitar reemplazando el token, ver
-- `invitar()` en lib/cuidadores/nucleo.ts).
create unique index idx_vinculo_unico on vinculos_cuidador (elder_id, cuidador_id)
  where cuidador_id is not null;

-- Índices de soporte para las policies/RPCs de abajo (lookup por elder desde
-- "Mis cuidadores", y por cuidador desde el dashboard y las policies select).
create index idx_vinculos_elder on vinculos_cuidador (elder_id);
create index idx_vinculos_cuidador on vinculos_cuidador (cuidador_id);

create table alertas_dosis (               -- dedupe + log de envíos
  id uuid primary key default gen_random_uuid(),
  medicamento_id uuid not null references medicamentos(id) on delete cascade,
  fecha date not null,
  enviado_at timestamptz not null default now(),
  destinatarios int not null default 0,
  estado text not null check (estado in ('enviado', 'error')) default 'enviado',
  error text,
  unique (medicamento_id, fecha)
);

-- RLS: vinculos_cuidador ---------------------------------------------------

alter table vinculos_cuidador enable row level security;

-- El elder tiene CRUD sobre sus propios vínculos (crear invitación,
-- reinvitar, revocar, listar) — PERO el `with check` bloquea explícitamente
-- que un update directo (fuera de la RPC) deje la fila en estado='aceptado':
-- esa transición solo puede ocurrir dentro de reclamar_invitacion_cuidador(),
-- que corre `security definer` y por lo tanto ignora esta policy por
-- completo. Sin este chequeo, el propio elder podría auto-aceptar su
-- invitación (poniendo cuidador_id/estado a mano) y saltarse el
-- consentimiento del cuidador que la RPC está pensada para garantizar.
create policy vinculos_all_elder on vinculos_cuidador
  for all using (elder_id = auth.uid())
  with check (elder_id = auth.uid() and estado <> 'aceptado');

-- El cuidador ya vinculado (aceptado o pendiente) puede ver sus propios
-- vínculos — p. ej. para listar "a quién cuido" o depurar un pendiente. No
-- hay policy de insert/update/delete para el cuidador: la única vía de
-- escritura de su lado es la RPC security definer.
create policy vinculos_select_cuidador on vinculos_cuidador
  for select using (cuidador_id = auth.uid());

-- alertas_dosis: sin policies propias — solo el service_role (cron route)
-- lee/escribe esta tabla; RLS habilitada la cierra a cualquier rol normal.
alter table alertas_dosis enable row level security;

-- RLS: lectura aditiva del cuidador sobre datos del elder vinculado --------
-- Aditivas: coexisten con `medicamentos_all_self` / `medicamentos_tomas_all_self`
-- (002_rls_policies.sql) sin modificarlas ni reemplazarlas — Postgres evalúa
-- todas las policies del mismo comando (`select`) con OR.

create policy medicamentos_select_cuidador on medicamentos
  for select using (usuario_id in (
    select elder_id from vinculos_cuidador
    where cuidador_id = auth.uid() and estado = 'aceptado'
  ));

create policy medicamentos_tomas_select_cuidador on medicamentos_tomas
  for select using (usuario_id in (
    select elder_id from vinculos_cuidador
    where cuidador_id = auth.uid() and estado = 'aceptado'
  ));

-- RPCs ----------------------------------------------------------------------

-- Reclama una invitación pendiente para el usuario autenticado. Nunca recibe
-- cuidador_id como parámetro — siempre usa auth.uid() internamente, así que
-- no hay forma de reclamar una invitación en nombre de otra cuenta. Valida
-- que el token exista y esté pendiente, que no haya expirado, y que el email
-- de la invitación coincida (case-insensitive) con el email de la cuenta
-- autenticada (necesario porque el login es solo Google — no hay forma de
-- conocer de antemano el auth.users.id del cuidador invitado, solo su
-- email).
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
  from vinculos_cuidador
  where token = p_token and estado = 'pendiente'
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

-- Devuelve exactamente (elder_id, nombre) de cada elder con vínculo
-- aceptado hacia el cuidador autenticado — nunca expone el resto de
-- `perfiles` (ver nota de diseño arriba: RLS es de fila, no de columna).
create or replace function listar_elders_vinculados()
returns table (elder_id uuid, nombre text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select v.elder_id, p.nombre
  from vinculos_cuidador v
  join perfiles p on p.id = v.elder_id
  where v.cuidador_id = auth.uid() and v.estado = 'aceptado';
$$;

revoke execute on function reclamar_invitacion_cuidador(text) from public, anon;
revoke execute on function listar_elders_vinculados() from public, anon;

grant execute on function reclamar_invitacion_cuidador(text) to authenticated;
grant execute on function listar_elders_vinculados() to authenticated;
