-- Perfil V7 — tests for migration 025 (perfiles.apellido / telefono /
-- contacto_emergencia_relacion).
--
-- Each section is its own transaction that ROLLBACKs. A clean run prints one
-- `NOTICE: PASS: ...` per assertion.
--
-- Prerequisites: migrations up to 025 applied (025 is written, NOT applied as
-- of writing); three real accounts with a `perfiles` row: elder_id (E, owner),
-- cuidador_id (C, linked to E with rol 'editar' inside the fixtures) and
-- otro_id (O, unrelated). Connect as `postgres`.
--
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/perfil-campos.sql

\set ON_ERROR_STOP on

-- 1 — Owner: stores the new columns, CHECKs reject over-long values
begin;
  select set_config('app.e', (:elder_id)::text, true);
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    a text; t text; r text;
  begin
    update perfiles set apellido = 'Rodríguez', telefono = '+54 11 5555-0000',
      contacto_emergencia_relacion = 'Hermana' where id = e;
    select p.apellido, p.telefono, p.contacto_emergencia_relacion into a, t, r from perfiles p where p.id = e;
    if a <> 'Rodríguez' or t <> '+54 11 5555-0000' or r <> 'Hermana' then
      raise exception 'FAIL: 1a columns not stored';
    end if;
    raise notice 'PASS: 1a owner stores apellido/telefono/relacion';

    begin
      update perfiles set telefono = repeat('9', 41) where id = e;
      raise exception 'FAIL: 1b telefono accepted > 40 chars';
    exception when check_violation then null;
    end;
    raise notice 'PASS: 1b telefono length check';
  end $$;
rollback;

-- 2 — Caregiver with rol 'editar' can update them; a stranger cannot
begin;
  select set_config('app.e', (:elder_id)::text, true);
  select set_config('app.c', (:cuidador_id)::text, true);
  select set_config('app.o', (:otro_id)::text, true);

  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id = :cuidador_id;
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
    values ((:elder_id)::uuid, (:cuidador_id)::uuid, 'c@test.invalid', 'aceptado', now(), 'editar');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    update perfiles set contacto_emergencia_relacion = 'Pareja' where id = current_setting('app.e')::uuid;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 2a caregiver editar could not update'; end if;
    raise notice 'PASS: 2a caregiver (editar) updates the new columns';
  end $$;

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);

  do $$
  declare n int;
  begin
    update perfiles set apellido = 'Hack' where id = current_setting('app.e')::uuid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2b stranger updated a profile'; end if;
    raise notice 'PASS: 2b stranger cannot update';
  end $$;
rollback;
