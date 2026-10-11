-- Mis pastillas — RLS/RPC tests for migration 014 (inventario_pastillas).
--
-- Hand-written psql script, same style as modo-cuidador-rls.sql: each section
-- is its own transaction that ROLLBACKs, so running it against the live DB
-- leaves no fixture rows behind. A clean run prints one `NOTICE: PASS: ...`
-- per assertion; any `FAIL:` aborts that section.
--
-- Prerequisites:
--   1. Migrations 008/010 and 014 (`014_inventario_pastillas.sql`) applied.
--      As of writing, 014 is written but NOT applied (no DB password).
--   2. Three REAL existing accounts: elder_id (E1, owner of the stock),
--      cuidador_id (C, accepted caregiver of E1 in the fixtures) and
--      otro_id (X, unrelated user with NO link to E1).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/inventario-pastillas.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — Owner: CRUD + RPC adjusts atomically and clamps at 0
-- ===========================================================================
begin;

  insert into inventario_pastillas (id, usuario_id, nombre, dosis, stock, pastillas_por_toma)
  values ('aaaaaaaa-0000-0000-0000-000000000001', :elder_id, 'Test Pastilla', '10mg', 10, 2);

  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if n <> 1 then
      raise exception 'FAIL: 1a owner cannot see own inventory (% rows)', n;
    end if;
    raise notice 'PASS: 1a owner sees own inventory';
  end $$;

  do $$
  declare
    nuevo int;
  begin
    -- pastillas_por_toma = 2: one dose taken removes 2, unmarking returns 2.
    nuevo := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000001', -1);
    if nuevo <> 8 then
      raise exception 'FAIL: 1b expected stock 8 after one dose (x2), got %', nuevo;
    end if;
    nuevo := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000001', 1);
    if nuevo <> 10 then
      raise exception 'FAIL: 1b expected stock 10 after unmarking, got %', nuevo;
    end if;
    raise notice 'PASS: 1b RPC moves pastillas_por_toma per dose (10 -2 +2 = 10)';
  end $$;

  do $$
  declare
    nuevo int;
  begin
    nuevo := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000001', -100);
    if nuevo is not null then
      raise exception 'FAIL: 1c arbitrary delta accepted, returned %', nuevo;
    end if;
    raise notice 'PASS: 1c RPC rejects any direction other than -1/+1';
  end $$;

  do $$
  declare
    nuevo int;
  begin
    update inventario_pastillas set stock = 1 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    nuevo := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000001', -1);
    if nuevo <> 0 then
      raise exception 'FAIL: 1c2 stock should clamp at 0, got %', nuevo;
    end if;
    raise notice 'PASS: 1c2 stock never goes below 0';
  end $$;

  do $$
  begin
    update inventario_pastillas set stock = -1 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL: 1d negative stock accepted by check constraint';
  exception
    when check_violation then
      raise notice 'PASS: 1d check (stock >= 0) rejects negative stock';
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 2 — Accepted caregiver: can SELECT and use the RPC, but NOT write directly
-- ===========================================================================
begin;

  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
  values (:elder_id, :cuidador_id, 'caregiver-test@example.com', 'aceptado', now());

  insert into inventario_pastillas (id, usuario_id, nombre, stock)
  values ('aaaaaaaa-0000-0000-0000-000000000002', :elder_id, 'Test Pastilla C', 8);

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000002';
    if n <> 1 then
      raise exception 'FAIL: 2a caregiver cannot read elder inventory (% rows)', n;
    end if;
    raise notice 'PASS: 2a caregiver reads elder inventory';
  end $$;

  do $$
  declare
    nuevo int;
  begin
    nuevo := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000002', -1);
    if nuevo is distinct from 7 then
      raise exception 'FAIL: 2b caregiver RPC expected stock 7, got %', nuevo;
    end if;
    raise notice 'PASS: 2b caregiver can decrement one dose via RPC';

    nuevo := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000002', 500);
    if nuevo is not null then
      raise exception 'FAIL: 2b2 caregiver set arbitrary stock via RPC (%)', nuevo;
    end if;
    raise notice 'PASS: 2b2 caregiver cannot pass an arbitrary amount';
  end $$;

  do $$
  declare
    filas int;
  begin
    update inventario_pastillas set stock = 999 where id = 'aaaaaaaa-0000-0000-0000-000000000002';
    get diagnostics filas = row_count;
    if filas <> 0 then
      raise exception 'FAIL: 2c caregiver direct UPDATE affected % rows, expected 0', filas;
    end if;
    raise notice 'PASS: 2c caregiver direct UPDATE affected 0 rows';
  end $$;

  do $$
  declare
    filas int;
  begin
    delete from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000002';
    get diagnostics filas = row_count;
    if filas <> 0 then
      raise exception 'FAIL: 2d caregiver direct DELETE affected % rows, expected 0', filas;
    end if;
    raise notice 'PASS: 2d caregiver direct DELETE affected 0 rows';
  end $$;

  -- psql variables are not interpolated inside dollar-quoted DO blocks, so
  -- the elder id is passed through a transaction-local setting.
  select set_config('test.elder_id', (:elder_id)::text, true);

  do $$
  begin
    insert into inventario_pastillas (usuario_id, nombre, stock)
    values (current_setting('test.elder_id')::uuid, 'Intruso', 1);
    raise exception 'FAIL: 2e caregiver direct INSERT was accepted';
  exception
    when insufficient_privilege then
      raise notice 'PASS: 2e caregiver direct INSERT rejected by RLS';
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 3 — Unrelated user and pending-link caregiver: zero access
-- ===========================================================================
begin;

  insert into inventario_pastillas (id, usuario_id, nombre, stock)
  values ('aaaaaaaa-0000-0000-0000-000000000003', :elder_id, 'Test Pastilla X', 5);

  -- C only has a PENDING link: must not count as an accepted caregiver.
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado)
  values (:elder_id, :cuidador_id, 'caregiver-test@example.com', 'pendiente');

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
    resultado int;
  begin
    select count(*) into n from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000003';
    if n <> 0 then
      raise exception 'FAIL: 3a unrelated user saw % inventory rows, expected 0', n;
    end if;
    raise notice 'PASS: 3a unrelated user sees 0 rows';

    resultado := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000003', -1);
    if resultado is not null then
      raise exception 'FAIL: 3b unrelated user RPC returned %, expected null', resultado;
    end if;
    raise notice 'PASS: 3b unrelated user RPC is a no-op (null)';
  end $$;

reset role;

  -- Stock must be untouched after the failed RPC attempt (checked as postgres).
  do $$
  declare
    s int;
  begin
    select stock into s from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000003';
    if s <> 5 then
      raise exception 'FAIL: 3c stock mutated by unauthorized RPC, now %', s;
    end if;
    raise notice 'PASS: 3c stock untouched after unauthorized RPC';
  end $$;

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
    resultado int;
  begin
    select count(*) into n from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000003';
    resultado := ajustar_stock_pastillas('aaaaaaaa-0000-0000-0000-000000000003', -1);
    if n <> 0 or resultado is not null then
      raise exception 'FAIL: 3d pending-link caregiver got access (rows=%, rpc=%)', n, resultado;
    end if;
    raise notice 'PASS: 3d pending-link caregiver has zero access';
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 4 — Unique inventory per medicine (usuario + normalized nombre + dosis)
--     and on delete set null for medicamentos.inventario_id
-- ===========================================================================
begin;

  insert into inventario_pastillas (id, usuario_id, nombre, dosis, stock)
  values ('aaaaaaaa-0000-0000-0000-000000000004', :elder_id, 'Enalapril', '10 mg', 20);

  select set_config('test.elder_id', (:elder_id)::text, true);

  do $$
  begin
    insert into inventario_pastillas (usuario_id, nombre, dosis, stock)
    values (current_setting('test.elder_id')::uuid, '  enalapril ', '10 MG', 1);
    raise exception 'FAIL: 4a duplicate (case/space-insensitive) inventory accepted';
  exception
    when unique_violation then
      raise notice 'PASS: 4a unique index rejects duplicate nombre+dosis';
  end $$;

  -- Two rows of the same medicine (two moments) share ONE stock.
  insert into medicamentos (id, usuario_id, nombre, dosis, hora_programada, momento_dia, dias_recurrentes, inventario_id)
  values
    ('bbbbbbbb-0000-0000-0000-000000000001', :elder_id, 'Enalapril', '10 mg', '08:00', 'mañana', '{}', 'aaaaaaaa-0000-0000-0000-000000000004'),
    ('bbbbbbbb-0000-0000-0000-000000000002', :elder_id, 'Enalapril', '10 mg', '22:00', 'noche', '{}', 'aaaaaaaa-0000-0000-0000-000000000004');

  do $$
  declare
    n int;
  begin
    select count(distinct inventario_id) into n from medicamentos
      where id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
    if n <> 1 then
      raise exception 'FAIL: 4b sibling rows point to % distinct inventories, expected 1', n;
    end if;
    raise notice 'PASS: 4b sibling medicamentos rows share one inventory';
  end $$;

  delete from inventario_pastillas where id = 'aaaaaaaa-0000-0000-0000-000000000004';

  do $$
  declare
    n int;
  begin
    select count(*) into n from medicamentos
      where id in ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')
        and inventario_id is null;
    if n <> 2 then
      raise exception 'FAIL: 4c on delete set null left % of 2 rows unlinked', n;
    end if;
    raise notice 'PASS: 4c deleting the inventory nulls medicamentos.inventario_id';
  end $$;

rollback;

\echo 'All inventario-pastillas sections completed — read above for PASS/FAIL per assertion.'
