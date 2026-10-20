-- Familia — tests for migration 021 (rol per link + caregiver RLS).
--
-- Hand-written psql script, same style as autovinculo.sql: each section is
-- its own transaction that ROLLBACKs, so no fixture rows remain (any real
-- link between these accounts is deleted inside the transaction and comes
-- back on rollback). A clean run prints one `NOTICE: PASS: ...` per assertion.
--
-- Prerequisites:
--   1. Migrations up to 021 applied.
--   2. Three REAL existing accounts (auth.users): cuidador_id (C),
--      elder_id (E) and otro_id (O, unrelated to E).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v cuidador_id="'<uuid>'" -v elder_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/familia.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — Caregiver with rol 'editar' can CRUD meds / tomas / turnos of E
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('cccccccc-0000-0000-0000-000000000001', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar');
  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia)
  values ('cccccccc-0000-0000-0000-0000000000a1', :elder_id, 'Familia test', '08:00', 'mañana');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from medicamentos m where m.id = 'cccccccc-0000-0000-0000-0000000000a1';
    if n <> 1 then raise exception 'FAIL: 1a editor cannot read E meds'; end if;

    insert into medicamentos (usuario_id, nombre, hora_programada, momento_dia)
    values (e, 'Familia nuevo', '20:00', 'noche');

    update medicamentos m set notas = 'editado' where m.id = 'cccccccc-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1b editor cannot update E med'; end if;

    insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado)
    values ('cccccccc-0000-0000-0000-0000000000a1', e, current_date, true);
    update medicamentos_tomas t set tomado = false
    where t.medicamento_id = 'cccccccc-0000-0000-0000-0000000000a1' and t.fecha = current_date;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1c editor cannot update E toma'; end if;
    delete from medicamentos_tomas t where t.medicamento_id = 'cccccccc-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1d editor cannot delete E toma'; end if;

    insert into turnos (id, usuario_id, especialidad, fecha, hora)
    values ('cccccccc-0000-0000-0000-0000000000b1', e, 'Clínica', current_date + 1, '10:00');
    update turnos t set lugar = 'Hospital' where t.id = 'cccccccc-0000-0000-0000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1e editor cannot update E turno'; end if;
    delete from turnos t where t.id = 'cccccccc-0000-0000-0000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1f editor cannot delete E turno'; end if;

    delete from medicamentos m where m.id = 'cccccccc-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1g editor cannot delete E med'; end if;

    update perfiles p set alergias = array['Test'] where p.id = e;
    get diagnostics n = row_count;
    -- 0 rows is acceptable only if E has no perfiles row.
    if n <> 1 and exists (select 1 from perfiles p2 where p2.id = e) then
      raise exception 'FAIL: 1h editor cannot update E health fields';
    end if;

    begin
      update perfiles p set uso_app = 'cuido' where p.id = e;
      if found then raise exception 'FAIL: 1i editor changed E uso_app'; end if;
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      if sqlerrm <> 'columna_no_editable_por_cuidador' then
        raise exception 'FAIL: 1i expected columna_no_editable_por_cuidador, got %', sqlerrm;
      end if;
    end;

    raise notice 'PASS: 1 editor caregiver CRUDs meds/tomas/turnos and edits only health fields';
  end $$;

rollback;

-- ===========================================================================
-- 2 — Caregiver with rol 'ver' can only SELECT
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('cccccccc-0000-0000-0000-000000000002', :elder_id, :cuidador_id, '', 'aceptado', now(), 'ver');
  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia)
  values ('cccccccc-0000-0000-0000-0000000000a2', :elder_id, 'Familia test', '08:00', 'mañana');
  insert into turnos (id, usuario_id, especialidad, fecha, hora)
  values ('cccccccc-0000-0000-0000-0000000000b2', :elder_id, 'Clínica', current_date + 1, '10:00');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from medicamentos m where m.id = 'cccccccc-0000-0000-0000-0000000000a2';
    if n <> 1 then raise exception 'FAIL: 2a viewer cannot read E meds'; end if;
    select count(*) into n from turnos t where t.id = 'cccccccc-0000-0000-0000-0000000000b2';
    if n <> 1 then raise exception 'FAIL: 2b viewer cannot read E turnos'; end if;

    begin
      insert into medicamentos (usuario_id, nombre, hora_programada, momento_dia)
      values (e, 'No debería', '20:00', 'noche');
      raise exception 'FAIL: 2c viewer inserted a med';
    exception when insufficient_privilege then null;
    end;

    begin
      insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado)
      values ('cccccccc-0000-0000-0000-0000000000a2', e, current_date, true);
      raise exception 'FAIL: 2d viewer inserted a toma';
    exception when insufficient_privilege then null;
    end;

    begin
      insert into turnos (usuario_id, especialidad, fecha, hora)
      values (e, 'No debería', current_date + 1, '10:00');
      raise exception 'FAIL: 2e viewer inserted a turno';
    exception when insufficient_privilege then null;
    end;

    update medicamentos m set notas = 'x' where m.id = 'cccccccc-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2f viewer updated a med'; end if;
    delete from medicamentos m where m.id = 'cccccccc-0000-0000-0000-0000000000a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2g viewer deleted a med'; end if;
    delete from turnos t where t.id = 'cccccccc-0000-0000-0000-0000000000b2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2h viewer deleted a turno'; end if;
    update perfiles p set alergias = array['x'] where p.id = e;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2i viewer updated E perfil'; end if;

    begin
      insert into codigos_acceso (elder_id, cuidador_id, codigo_hash, salt, expira_at)
      values (e, auth.uid(), 'h', 's', now() + interval '15 minutes');
      raise exception 'FAIL: 2j viewer generated an access code';
    exception when insufficient_privilege then null;
    end;

    if not es_cuidador_de(e) or puede_editar_de(e) then
      raise exception 'FAIL: 2k helpers wrong for viewer';
    end if;

    raise notice 'PASS: 2 viewer caregiver can only read';
  end $$;

rollback;

-- ===========================================================================
-- 3 — Unrelated user sees and writes nothing of E
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id = :otro_id;
  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia)
  values ('cccccccc-0000-0000-0000-0000000000a3', :elder_id, 'Familia test', '08:00', 'mañana');

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    select count(*) into n from medicamentos m where m.usuario_id = e;
    if n <> 0 then raise exception 'FAIL: 3a unrelated user reads E meds'; end if;
    select count(*) into n from perfiles p where p.id = e;
    if n <> 0 then raise exception 'FAIL: 3b unrelated user reads E perfil'; end if;
    select count(*) into n from turnos t where t.usuario_id = e;
    if n <> 0 then raise exception 'FAIL: 3c unrelated user reads E turnos'; end if;

    begin
      insert into medicamentos (usuario_id, nombre, hora_programada, momento_dia)
      values (e, 'No debería', '20:00', 'noche');
      raise exception 'FAIL: 3d unrelated user inserted a med';
    exception when insufficient_privilege then null;
    end;

    delete from medicamentos m where m.id = 'cccccccc-0000-0000-0000-0000000000a3';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 3e unrelated user deleted a med'; end if;

    if es_cuidador_de(e) then raise exception 'FAIL: 3f es_cuidador_de true for unrelated'; end if;

    select count(*) into n from listar_familia() f where f.elder_id = e;
    if n <> 0 then raise exception 'FAIL: 3g listar_familia leaks E'; end if;

    raise notice 'PASS: 3 unrelated user has no access';
  end $$;

rollback;

-- ===========================================================================
-- 4 — E keeps full access to own data; E changes the caregiver rol;
--     the caregiver cannot change it
-- ===========================================================================
begin;

  select set_config('app.e', (:elder_id)::text, true);
  delete from vinculos_cuidador where elder_id = :elder_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('cccccccc-0000-0000-0000-000000000004', :elder_id, :cuidador_id, '', 'aceptado', now(), 'editar');

  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    e uuid := current_setting('app.e')::uuid;
    n int;
  begin
    insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia)
    values ('cccccccc-0000-0000-0000-0000000000a4', e, 'Propio', '08:00', 'mañana');
    update medicamentos m set notas = 'x' where m.id = 'cccccccc-0000-0000-0000-0000000000a4';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 4a elder cannot update own med'; end if;
    insert into turnos (usuario_id, especialidad, fecha, hora) values (e, 'Propio', current_date + 1, '09:00');
    delete from medicamentos m where m.id = 'cccccccc-0000-0000-0000-0000000000a4';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 4b elder cannot delete own med'; end if;

    -- Owner can still change uso_app (trigger only restricts non-owners).
    update perfiles p set uso_app = p.uso_app where p.id = e;

    if not cambiar_rol_cuidador('cccccccc-0000-0000-0000-000000000004', 'ver') then
      raise exception 'FAIL: 4c elder cannot change caregiver rol';
    end if;
    select count(*) into n from vinculos_cuidador vc
    where vc.id = 'cccccccc-0000-0000-0000-000000000004' and vc.rol = 'ver';
    if n <> 1 then raise exception 'FAIL: 4d rol not persisted'; end if;

    select count(*) into n from listar_mis_cuidadores() c
    where c.vinculo_id = 'cccccccc-0000-0000-0000-000000000004' and c.rol = 'ver';
    if n <> 1 then raise exception 'FAIL: 4e listar_mis_cuidadores missing the link'; end if;

    raise notice 'PASS: 4 elder keeps full access and controls the rol';
  end $$;

  -- Now as the caregiver: cannot flip the rol back, can leave.
  reset role;
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    if cambiar_rol_cuidador('cccccccc-0000-0000-0000-000000000004', 'editar') then
      raise exception 'FAIL: 4f caregiver changed their own rol';
    end if;
    select count(*) into n from listar_familia() f
    where f.vinculo_id = 'cccccccc-0000-0000-0000-000000000004' and f.rol = 'ver';
    if n <> 1 then raise exception 'FAIL: 4g listar_familia missing the link'; end if;
    if not dejar_de_cuidar('cccccccc-0000-0000-0000-000000000004') then
      raise exception 'FAIL: 4h caregiver cannot leave';
    end if;
    select count(*) into n from listar_familia() f where f.vinculo_id = 'cccccccc-0000-0000-0000-000000000004';
    if n <> 0 then raise exception 'FAIL: 4i revoked link still listed'; end if;
    raise notice 'PASS: 4 caregiver cannot change the rol and can stop caring';
  end $$;

rollback;

-- ===========================================================================
-- 5 — Self-link is still blocked (016) and never grants caregiver access
-- ===========================================================================
begin;

  select set_config('app.c', (:cuidador_id)::text, true);

  do $$
  declare
    c uuid := current_setting('app.c')::uuid;
  begin
    begin
      insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
      values (c, c, '', 'aceptado', now());
      raise exception 'FAIL: 5a self-link inserted';
    exception when check_violation then null;
    end;
    raise notice 'PASS: 5a self-link rejected by vinculos_sin_autovinculo';
  end $$;

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    c uuid := current_setting('app.c')::uuid;
  begin
    if es_cuidador_de(c) or puede_editar_de(c) then
      raise exception 'FAIL: 5b helpers true for self (legacy self-link?)';
    end if;
    raise notice 'PASS: 5b helpers ignore self';
  end $$;

rollback;
