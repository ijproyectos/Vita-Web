-- Rutina V7 — tests for migration 023 (medicamentos/turnos detail columns + recetas).
--
-- Same style as mediciones.sql: every section is its own transaction that
-- ROLLBACKs. A clean run prints one `NOTICE: PASS: ...` per assertion.
--
-- Prerequisites: migrations up to 023 applied (023 is written, NOT applied as
-- of writing); three real accounts: elder_id (E, owner), cuidador_id (C, linked
-- to E inside the fixtures) and otro_id (O, unrelated). Connect as `postgres`.
--
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/rutina-detalles.sql

\set ON_ERROR_STOP on

-- 1 — Owner: new columns and CHECKs
begin;
  select set_config('app.e', (:elder_id)::text, true);
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    t_id uuid;
    l jsonb;
  begin
    insert into turnos (usuario_id, especialidad, fecha, hora, direccion, telefono, llevar)
      values (e, 'Cardiología', current_date + 1, '10:00', 'Av. Cabildo 2450', '11 5555-0000', '[{"t":"DNI","ok":false}]')
      returning id into t_id;
    select t.llevar into l from turnos t where t.id = t_id;
    if jsonb_array_length(l) <> 1 then raise exception 'FAIL: 1a llevar not stored'; end if;
    raise notice 'PASS: 1a owner stores direccion/telefono/llevar';

    begin
      update turnos set llevar = '{"a":1}'::jsonb where id = t_id;
      raise exception 'FAIL: 1b llevar accepted a non-array';
    exception when check_violation then null;
    end;
    raise notice 'PASS: 1b llevar must be a json array';

    insert into recetas (usuario_id, nombre, fecha) values (e, 'Metformina', current_date + 3);
    raise notice 'PASS: 1c owner inserts a receta';
  end $$;
rollback;

-- 2 — Stranger cannot read recetas
begin;
  select set_config('app.e', (:elder_id)::text, true);
  insert into recetas (usuario_id, nombre, fecha) values ((:elder_id)::uuid, 'Losartán', current_date);
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from recetas r where r.usuario_id = current_setting('app.e')::uuid;
    if n <> 0 then raise exception 'FAIL: 2a stranger reads recetas'; end if;
    raise notice 'PASS: 2a stranger cannot read recetas';
  end $$;
rollback;

-- 3 — Caregiver: read with any role, write only with rol 'editar'
begin;
  select set_config('app.e', (:elder_id)::text, true);
  select set_config('app.c', (:cuidador_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id = :cuidador_id;
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
    values (gen_random_uuid(), (:elder_id)::uuid, (:cuidador_id)::uuid, 'c@test.invalid', 'aceptado', now(), 'ver');
  insert into recetas (usuario_id, nombre, fecha) values ((:elder_id)::uuid, 'Losartán', current_date);
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from recetas r where r.usuario_id = current_setting('app.e')::uuid;
    if n < 1 then raise exception 'FAIL: 3a lector cannot read recetas'; end if;
    raise notice 'PASS: 3a lector reads recetas';
    begin
      insert into recetas (usuario_id, nombre, fecha) values (current_setting('app.e')::uuid, 'X', current_date);
      raise exception 'FAIL: 3b lector inserted a receta';
    exception when insufficient_privilege then null;
    end;
    raise notice 'PASS: 3b lector cannot write recetas';
  end $$;
rollback;
