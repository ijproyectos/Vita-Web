-- Monitoreo activo — RLS/CHECK tests for migration 022 (mediciones).
--
-- Hand-written psql script, same style as familia.sql: each section is its
-- own transaction that ROLLBACKs, so no fixture rows remain. A clean run
-- prints one `NOTICE: PASS: ...` per assertion; any `FAIL:` aborts.
--
-- Prerequisites:
--   1. Migrations up to 022 applied (021 provides es_cuidador_de/puede_editar_de).
--      As of writing, 022 is written but NOT applied.
--   2. Three REAL existing accounts (auth.users): elder_id (E, owner),
--      cuidador_id (C, linked to E inside the fixtures) and otro_id (O,
--      unrelated to E).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/mediciones.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — Owner: CRUD + CHECK constraints
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    insert into mediciones (usuario_id, tipo, valor, valor_secundario, pulso) values (e, 'presion', 120, 80, 70);
    insert into mediciones (usuario_id, tipo, valor, contexto) values (e, 'glucemia', 95, 'ayunas');
    insert into mediciones (usuario_id, tipo, valor) values (e, 'peso', 70.5);
    select count(*) into n from mediciones m where m.usuario_id = e;
    if n < 3 then raise exception 'FAIL: 1a owner cannot insert/read own mediciones (% rows)', n; end if;
    raise notice 'PASS: 1a owner inserts and reads own mediciones';

    delete from mediciones m where m.usuario_id = e and m.tipo = 'peso';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1b owner cannot delete own medicion'; end if;
    raise notice 'PASS: 1b owner deletes own medicion';
  end $$;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
  begin
    begin
      insert into mediciones (usuario_id, tipo, valor, valor_secundario) values (e, 'presion', 120, null);
      raise exception 'FAIL: 1c presion without diastolic accepted';
    exception when check_violation then null;
    end;
    begin
      insert into mediciones (usuario_id, tipo, valor, valor_secundario) values (e, 'presion', 80, 120);
      raise exception 'FAIL: 1c diastolic >= systolic accepted';
    exception when check_violation then null;
    end;
    begin
      insert into mediciones (usuario_id, tipo, valor) values (e, 'saturacion', 140);
      raise exception 'FAIL: 1c saturacion 140 accepted';
    exception when check_violation then null;
    end;
    begin
      insert into mediciones (usuario_id, tipo, valor, contexto) values (e, 'peso', 70, 'ayunas');
      raise exception 'FAIL: 1c contexto on non-glucemia accepted';
    exception when check_violation then null;
    end;
    begin
      insert into mediciones (usuario_id, tipo, valor) values (e, 'colesterol', 180);
      raise exception 'FAIL: 1c unknown tipo accepted';
    exception when check_violation then null;
    end;
    raise notice 'PASS: 1c CHECKs reject implausible / inconsistent rows';
  end $$;

rollback;

-- ===========================================================================
-- 2 — Caregiver 'editar' reads and writes; 'ver' reads only; stranger sees nothing
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar');
  insert into mediciones (id, usuario_id, tipo, valor) values ('dddddddd-0000-0000-0000-0000000000a1', :elder_id, 'peso', 65);

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from mediciones m where m.id = 'dddddddd-0000-0000-0000-0000000000a1';
    if n <> 1 then raise exception 'FAIL: 2a editor cannot read E mediciones'; end if;

    insert into mediciones (usuario_id, tipo, valor) values (e, 'peso', 66);
    update mediciones m set notas = 'editado' where m.id = 'dddddddd-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 2b editor cannot update E medicion'; end if;
    delete from mediciones m where m.id = 'dddddddd-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 2c editor cannot delete E medicion'; end if;
    raise notice 'PASS: 2a-c editor reads, inserts, updates and deletes E mediciones';
  end $$;

rollback;

begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000002', :elder_id, :cuidador_id, '', 'aceptado', now(), 'ver');
  insert into mediciones (id, usuario_id, tipo, valor) values ('dddddddd-0000-0000-0000-0000000000a2', :elder_id, 'peso', 65);

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from mediciones m where m.id = 'dddddddd-0000-0000-0000-0000000000a2';
    if n <> 1 then raise exception 'FAIL: 2d viewer cannot read E mediciones'; end if;

    begin
      insert into mediciones (usuario_id, tipo, valor) values (e, 'peso', 70);
      raise exception 'FAIL: 2e viewer inserted a medicion for E';
    exception when insufficient_privilege then null;
    end;

    update mediciones m set notas = 'x' where m.id = 'dddddddd-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2f viewer updated E medicion'; end if;
    delete from mediciones m where m.id = 'dddddddd-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2g viewer deleted E medicion'; end if;
    raise notice 'PASS: 2d-g viewer reads but cannot write E mediciones';
  end $$;

rollback;

begin;

  insert into mediciones (id, usuario_id, tipo, valor) values ('dddddddd-0000-0000-0000-0000000000a3', :elder_id, 'peso', 65);

  select set_config('app.e', (:elder_id)::text, true);
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from mediciones m where m.usuario_id = e;
    if n <> 0 then raise exception 'FAIL: 2h stranger sees E mediciones (% rows)', n; end if;
    begin
      insert into mediciones (usuario_id, tipo, valor) values (e, 'peso', 70);
      raise exception 'FAIL: 2i stranger inserted a medicion for E';
    exception when insufficient_privilege then null;
    end;
    raise notice 'PASS: 2h-i unrelated user neither reads nor writes E mediciones';
  end $$;

rollback;
