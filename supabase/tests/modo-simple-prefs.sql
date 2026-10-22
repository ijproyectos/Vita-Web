-- Modo simple (migración 029) — RLS tests for preferencias_modo_simple.
--
-- Hand-written psql script (no test runner in the repo). Each section is its
-- own transaction ending in ROLLBACK, so no rows remain. A clean run prints
-- `NOTICE: PASS: ...`; a `FAIL:` aborts.
--
-- Prerequisites: migrations up to 029 applied; three REAL accounts:
-- elder_id (E), cuidador_id (C, will be linked to E) and otro_id (O, unrelated).
-- Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/modo-simple-prefs.sql

\set ON_ERROR_STOP on

select set_config('test.e', (:elder_id)::text, false);
select set_config('test.c', (:cuidador_id)::text, false);
select set_config('test.o', (:otro_id)::text, false);

-- ===========================================================================
-- A — dueño: lee, crea y cambia; checks de dominio
-- ===========================================================================
begin;
  delete from preferencias_modo_simple where usuario_id = :elder_id;

  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int; e uuid := current_setting('test.e')::uuid;
  begin
    insert into preferencias_modo_simple (usuario_id, posponer_min) values (e, 30);
    select count(*) into n from preferencias_modo_simple where usuario_id = e and posponer_min = 30 and ver_turnos;
    if n <> 1 then raise exception 'FAIL: A1 el dueño no pudo crear/leer su fila (defaults)'; end if;
    raise notice 'PASS: A1 dueño crea y lee';

    begin
      update preferencias_modo_simple set posponer_min = 20 where usuario_id = e;
      raise exception 'FAIL: A2 posponer_min aceptó 20';
    exception when check_violation then
      raise notice 'PASS: A2 posponer_min fuera de (15,30,60) rechazado';
    end;

    begin
      update preferencias_modo_simple set llamar_nombre = 'Mica' where usuario_id = e;
      raise exception 'FAIL: A3 nombre sin teléfono aceptado';
    exception when check_violation then
      raise notice 'PASS: A3 llamar_nombre exige llamar_telefono';
    end;
  end $$;
rollback;

-- ===========================================================================
-- B — cuidador 'ver': lee, no escribe. Cuidador 'editar': lee y escribe
-- ===========================================================================
begin;
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  delete from preferencias_modo_simple where usuario_id = :elder_id;
  insert into preferencias_modo_simple (usuario_id, voz_lenta) values (:elder_id, true);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'ver');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int; e uuid := current_setting('test.e')::uuid;
  begin
    select count(*) into n from preferencias_modo_simple where usuario_id = e;
    if n <> 1 then raise exception 'FAIL: B1 cuidador ver no lee la fila'; end if;
    raise notice 'PASS: B1 cuidador ver lee';

    update preferencias_modo_simple set voz_lenta = false where usuario_id = e;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: B2 cuidador ver modificó la fila'; end if;
    raise notice 'PASS: B2 cuidador ver no modifica';
  end $$;

  reset role;
  update vinculos_cuidador set rol = 'editar' where id = 'dddddddd-0000-0000-0000-000000000001';
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int; e uuid := current_setting('test.e')::uuid;
  begin
    update preferencias_modo_simple set voz_lenta = false where usuario_id = e;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: B3 cuidador editar no pudo modificar'; end if;
    raise notice 'PASS: B3 cuidador editar modifica';

    delete from preferencias_modo_simple where usuario_id = e;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: B4 cuidador borró la fila'; end if;
    raise notice 'PASS: B4 nadie borra (cuidador)';
  end $$;

  -- sin fila previa: un Admin puede crearla
  reset role;
  delete from preferencias_modo_simple where usuario_id = :elder_id;
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare e uuid := current_setting('test.e')::uuid;
  begin
    insert into preferencias_modo_simple (usuario_id, ayuda) values (e, false);
    raise notice 'PASS: B5 cuidador editar crea la fila';
  end $$;
rollback;

-- ===========================================================================
-- C — ajeno: no ve ni escribe
-- ===========================================================================
begin;
  delete from preferencias_modo_simple where usuario_id = :elder_id;
  insert into preferencias_modo_simple (usuario_id) values (:elder_id);

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int; e uuid := current_setting('test.e')::uuid;
  begin
    select count(*) into n from preferencias_modo_simple where usuario_id = e;
    if n <> 0 then raise exception 'FAIL: C1 un ajeno ve la fila'; end if;
    raise notice 'PASS: C1 ajeno no ve';

    update preferencias_modo_simple set voz = false where usuario_id = e;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: C2 un ajeno modificó la fila'; end if;
    raise notice 'PASS: C2 ajeno no modifica';

    begin
      insert into preferencias_modo_simple (usuario_id) values (current_setting('test.o')::uuid);
      raise notice 'PASS: C3 ajeno puede crear SU propia fila';
    end;
  end $$;
rollback;
