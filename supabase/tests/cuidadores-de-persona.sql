-- Cuidadores de una persona — tests for migration 027.
--
-- Hand-written psql script, same style as familia.sql: every section is its
-- own transaction that ROLLBACKs (links and the metadata flag set inside are
-- undone). A clean run prints one `NOTICE: PASS: ...` per assertion.
--
-- Prerequisites:
--   1. Migrations up to 027 applied.
--   2. Three REAL existing accounts (auth.users): cuidador_id (C, will be an
--      Admin carer), elder_id (E, the cared-for person) and otro_id (O, a
--      second carer / unrelated account depending on the section).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v cuidador_id="'<uuid>'" -v elder_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/cuidadores-de-persona.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — An unrelated account sees nothing and cannot manage
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar');

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
    ok boolean;
  begin
    select count(*) into n from listar_cuidadores_de(e);
    if n <> 0 then raise exception 'FAIL: 1a unrelated account sees carers'; end if;
    raise notice 'PASS: 1a unrelated account sees no carers';

    begin
      perform invitar_cuidador(e, 'nadie@example.com', 'Nadie', 'Otro', 'ver');
      raise exception 'FAIL: 1b unrelated account could invite';
    exception when others then
      if sqlerrm <> 'sin_permiso' then raise; end if;
    end;
    raise notice 'PASS: 1b unrelated account cannot invite';

    select quitar_cuidador('dddddddd-0000-0000-0000-000000000001') into ok;
    if ok then raise exception 'FAIL: 1c unrelated account removed a carer'; end if;
    select cambiar_rol_cuidador('dddddddd-0000-0000-0000-000000000001', 'ver') into ok;
    if ok then raise exception 'FAIL: 1d unrelated account changed a role'; end if;
    raise notice 'PASS: 1c/1d unrelated account cannot remove or change roles';
  end $$;

rollback;

-- ===========================================================================
-- 2 — Admin carer of a NON-managed person: sees the list, cannot manage
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  select set_config('app.o', (:otro_id)::text, true);
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'tipo' where id = :elder_id;
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar'),
         ('dddddddd-0000-0000-0000-000000000002', :elder_id, :otro_id, '', 'aceptado', now(), 'ver');
  insert into vinculos_cuidador (id, elder_id, email_invitado, estado, rol)
  values ('dddddddd-0000-0000-0000-000000000003', :elder_id, 'pendiente@example.com', 'pendiente', 'ver');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
    ok boolean;
  begin
    select count(*) into n from listar_cuidadores_de(e);
    if n <> 2 then raise exception 'FAIL: 2a carer should see 2 accepted carers, saw %', n; end if;
    select count(*) into n from listar_cuidadores_de(e) l where l.es_yo;
    if n <> 1 then raise exception 'FAIL: 2b es_yo should mark exactly one row'; end if;
    select count(*) into n from listar_cuidadores_de(e) l where l.email is not null or l.token is not null or l.puede_gestionar;
    if n <> 0 then raise exception 'FAIL: 2c carer of a non-managed person got email/token/gestion'; end if;
    raise notice 'PASS: 2a-2c carer sees accepted carers only, no emails/tokens';

    begin
      perform invitar_cuidador(e, 'nuevo@example.com', 'Nuevo', 'Otro', 'ver');
      raise exception 'FAIL: 2d Admin carer invited on a non-managed person';
    exception when others then
      if sqlerrm <> 'sin_permiso' then raise; end if;
    end;
    select cambiar_rol_cuidador('dddddddd-0000-0000-0000-000000000002', 'editar') into ok;
    if ok then raise exception 'FAIL: 2e Admin carer changed a role on a non-managed person'; end if;
    select quitar_cuidador('dddddddd-0000-0000-0000-000000000002') into ok;
    if ok then raise exception 'FAIL: 2f Admin carer removed a carer on a non-managed person'; end if;
    raise notice 'PASS: 2d-2f only the person decides on a non-managed profile';
  end $$;

rollback;

-- ===========================================================================
-- 3 — Admin carer of a MANAGED profile: full management, never over themself
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  select set_config('app.o', (:otro_id)::text, true);
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"tipo":"perfil_gestionado"}'::jsonb
  where id = :elder_id;
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar'),
         ('dddddddd-0000-0000-0000-000000000002', :elder_id, :otro_id, '', 'aceptado', now(), 'ver');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
    ok boolean;
    inv record;
  begin
    select * into inv from invitar_cuidador(e, 'Nuevo@Example.com', 'Nuevo', 'Hermana', 'ver');
    if inv.token is null or length(inv.token) <> 48 then raise exception 'FAIL: 3a invitation without token'; end if;
    raise notice 'PASS: 3a Admin carer of a managed profile can invite';

    select * into inv from invitar_cuidador(e, 'nuevo@example.com', 'Nuevo', 'Hijo/a', 'editar');
    select count(*) into n from listar_cuidadores_de(e) l where l.estado = 'pendiente';
    if n <> 1 then raise exception 'FAIL: 3b re-inviting should reuse the pending row, found %', n; end if;
    select count(*) into n from listar_cuidadores_de(e) l
    where l.estado = 'pendiente' and l.email = 'nuevo@example.com' and l.token is not null and l.puede_gestionar
      and l.rol = 'editar' and l.relacion = 'Hijo/a' and l.nombre = 'Nuevo';
    if n <> 1 then raise exception 'FAIL: 3c pending row does not carry the invitation data'; end if;
    raise notice 'PASS: 3b/3c re-invite reuses the pending row; manager sees its data';

    begin
      perform invitar_cuidador(e, 'no-es-un-mail', 'X', null, 'ver');
      raise exception 'FAIL: 3d invalid email accepted';
    exception when others then
      if sqlerrm <> 'email_invalido' then raise; end if;
    end;
    begin
      perform invitar_cuidador(e, 'otro@example.com', 'X', null, 'dueño');
      raise exception 'FAIL: 3e invalid role accepted';
    exception when others then
      if sqlerrm <> 'rol_invalido' then raise; end if;
    end;
    raise notice 'PASS: 3d/3e email and role are validated';

    select cambiar_rol_cuidador('dddddddd-0000-0000-0000-000000000002', 'editar') into ok;
    if not ok then raise exception 'FAIL: 3f could not promote another carer'; end if;
    select cambiar_rol_cuidador('dddddddd-0000-0000-0000-000000000001', 'ver') into ok;
    if ok then raise exception 'FAIL: 3g carer changed their own role'; end if;
    raise notice 'PASS: 3f/3g change others, never yourself';

    select quitar_cuidador('dddddddd-0000-0000-0000-000000000001') into ok;
    if ok then raise exception 'FAIL: 3h carer removed themself through quitar_cuidador'; end if;
    select quitar_cuidador('dddddddd-0000-0000-0000-000000000002') into ok;
    if not ok then raise exception 'FAIL: 3i could not remove another carer'; end if;
    select count(*) into n from listar_cuidadores_de(e) l where l.cuidador_id = current_setting('app.o')::uuid;
    if n <> 0 then raise exception 'FAIL: 3j removed carer still listed'; end if;
    raise notice 'PASS: 3h-3j no self-removal here; removed carers disappear from the list';
  end $$;

rollback;

-- ===========================================================================
-- 4 — A Lector carer of a managed profile cannot manage; the person can
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  select set_config('app.o', (:otro_id)::text, true);
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"tipo":"perfil_gestionado"}'::jsonb
  where id = :elder_id;
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'ver'),
         ('dddddddd-0000-0000-0000-000000000002', :elder_id, :otro_id, '', 'aceptado', now(), 'editar');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    ok boolean;
  begin
    begin
      perform invitar_cuidador(e, 'nuevo@example.com', 'Nuevo', null, 'ver');
      raise exception 'FAIL: 4a Lector carer invited';
    exception when others then
      if sqlerrm <> 'sin_permiso' then raise; end if;
    end;
    select quitar_cuidador('dddddddd-0000-0000-0000-000000000002') into ok;
    if ok then raise exception 'FAIL: 4b Lector carer removed an Admin'; end if;
    raise notice 'PASS: 4a/4b a Lector carer cannot manage carers';
  end $$;

  reset role;
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    ok boolean;
    n int;
  begin
    select cambiar_rol_cuidador('dddddddd-0000-0000-0000-000000000001', 'editar') into ok;
    if not ok then raise exception 'FAIL: 4c the person could not change a carer role'; end if;
    select count(*) into n from listar_cuidadores_de(current_setting('app.e')::uuid) l where l.puede_gestionar;
    if n <> 2 then raise exception 'FAIL: 4d the person should manage (both rows flagged)'; end if;
    select quitar_cuidador('dddddddd-0000-0000-0000-000000000002') into ok;
    if not ok then raise exception 'FAIL: 4e the person could not remove a carer'; end if;
    raise notice 'PASS: 4c-4e the person manages their own carers';
  end $$;

rollback;
