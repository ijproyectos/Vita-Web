-- Mi Salud — RLS/CHECK tests for migration 024 (consultas, vacunas).
--
-- Same style as mediciones.sql: each section is a transaction that ROLLBACKs.
-- A clean run prints one `NOTICE: PASS: ...` per assertion; any `FAIL:` aborts.
--
-- Prerequisites: migrations up to 024 applied (024 is written, NOT applied);
-- three REAL accounts: elder_id (E), cuidador_id (C) and otro_id (O).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/consultas-vacunas.sql

\set ON_ERROR_STOP on

-- 1 — Owner: CRUD + CHECKs
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
    insert into consultas (usuario_id, especialidad, profesional, origen) values (e, 'Cardiología', 'Dr. Méndez', 'manual');
    insert into vacunas (usuario_id, nombre, dosis, origen) values (e, 'Hepatitis B', 'refuerzo', 'vita');
    select count(*) into n from consultas c where c.usuario_id = e;
    if n < 1 then raise exception 'FAIL: 1a owner cannot read own consultas'; end if;
    select count(*) into n from vacunas v where v.usuario_id = e;
    if n < 1 then raise exception 'FAIL: 1a owner cannot read own vacunas'; end if;
    raise notice 'PASS: 1a owner inserts and reads consultas and vacunas';

    begin
      insert into consultas (usuario_id, especialidad, origen) values (e, 'X', 'otro');
      raise exception 'FAIL: 1b unknown origen accepted';
    exception when check_violation then null;
    end;
    begin
      insert into vacunas (usuario_id, nombre) values (e, '');
      raise exception 'FAIL: 1b empty vacuna name accepted';
    exception when check_violation then null;
    end;
    raise notice 'PASS: 1b CHECKs reject bad origen / empty name';
  end $$;
rollback;

-- 2 — Caregiver 'editar'
begin;
  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000102', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar');
  insert into consultas (id, usuario_id, especialidad) values ('dddddddd-0000-0000-0000-0000000000c1', :elder_id, 'Clínica');
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from consultas x where x.id = 'dddddddd-0000-0000-0000-0000000000c1';
    if n <> 1 then raise exception 'FAIL: 2a editor cannot read E consultas'; end if;
    insert into vacunas (usuario_id, nombre) values (e, 'Antigripal');
    update consultas x set resumen = 'editado' where x.id = 'dddddddd-0000-0000-0000-0000000000c1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 2b editor cannot update E consulta'; end if;
    delete from consultas x where x.id = 'dddddddd-0000-0000-0000-0000000000c1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 2c editor cannot delete E consulta'; end if;
    raise notice 'PASS: 2a-c editor reads and writes E consultas/vacunas';
  end $$;
rollback;

-- 3 — Caregiver 'ver'
begin;
  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000103', :elder_id, :cuidador_id, '', 'aceptado', now(), 'ver');
  insert into consultas (id, usuario_id, especialidad) values ('dddddddd-0000-0000-0000-0000000000c1', :elder_id, 'Clínica');
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from consultas x where x.id = 'dddddddd-0000-0000-0000-0000000000c1';
    if n <> 1 then raise exception 'FAIL: 3a viewer cannot read E consultas'; end if;
    begin
      insert into vacunas (usuario_id, nombre) values (e, 'Antigripal');
      raise exception 'FAIL: 3b viewer inserted a vacuna for E';
    exception when insufficient_privilege then null;
    end;
    update consultas x set resumen = 'x' where x.id = 'dddddddd-0000-0000-0000-0000000000c1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 3c viewer updated E consulta'; end if;
    raise notice 'PASS: 3a-c viewer reads but cannot write E consultas/vacunas';
  end $$;
rollback;

-- 4 — Stranger sees nothing
begin;
  insert into consultas (usuario_id, especialidad) values (:elder_id, 'Clínica');
  insert into vacunas (usuario_id, nombre) values (:elder_id, 'Antigripal');
  select set_config('app.e', (:elder_id)::text, true);
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from consultas x where x.usuario_id = e;
    if n <> 0 then raise exception 'FAIL: 4a stranger sees E consultas'; end if;
    select count(*) into n from vacunas x where x.usuario_id = e;
    if n <> 0 then raise exception 'FAIL: 4a stranger sees E vacunas'; end if;
    begin
      insert into consultas (usuario_id, especialidad) values (e, 'X');
      raise exception 'FAIL: 4b stranger inserted a consulta for E';
    exception when insufficient_privilege then null;
    end;
    raise notice 'PASS: 4a-b unrelated user neither reads nor writes E consultas/vacunas';
  end $$;
rollback;
