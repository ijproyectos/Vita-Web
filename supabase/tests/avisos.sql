-- Avisos (migración 020) — RLS negative/positive tests.
--
-- Script psql escrito a mano (el repo no tiene test runner). Cada sección es
-- su propia transacción que termina en ROLLBACK: correrlo contra la DB real no
-- deja filas. Un run limpio imprime `NOTICE: PASS: ...`; un `FAIL:` aborta.
--
-- Requisitos: migración 020 aplicada; dos cuentas reales (usuario_id y
-- otro_id); conectar con el rol `postgres` del pooler (bypassa RLS para los
-- fixtures; los checks cambian a `authenticated`).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v usuario_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/avisos.sql
--
-- psql NO interpola :variables dentro de bloques DO $$ — los ids viajan por
-- set_config('test.*') y se leen con current_setting().

\set ON_ERROR_STOP on

select set_config('test.usuario', (:usuario_id)::text, false);
select set_config('test.otro', (:otro_id)::text, false);

-- ===========================================================================
-- A — avisos: dueño lee/marca leído/borra; ajeno no ve; nadie inserta
-- ===========================================================================
begin;

  insert into avisos (id, usuario_id, tipo, titulo, cuerpo, url)
  values ('aaaaaaaa-0000-0000-0000-000000000001', :usuario_id, 'dosis', 'Es hora de tu Test', '', '/app/modo-simple');

  -- Ajeno: no ve, no marca, no borra.
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from avisos where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'FAIL: otro usuario ve un aviso ajeno'; end if;
    raise notice 'PASS: aviso ajeno invisible';

    update avisos set leido_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario marcó leído un aviso ajeno'; end if;
    raise notice 'PASS: update ajeno no afecta filas';

    delete from avisos where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario borró un aviso ajeno'; end if;
    raise notice 'PASS: delete ajeno no afecta filas';
  end $$;

  -- Nadie inserta (ni a nombre propio): solo service_role.
  do $$
  begin
    begin
      insert into avisos (usuario_id, tipo, titulo) values (current_setting('test.otro')::uuid, 'dosis', 'forjado');
      raise exception 'FAIL: un usuario autenticado pudo insertar un aviso';
    exception when insufficient_privilege then
      raise notice 'PASS: insert de avisos bloqueado';
    end;
  end $$;

  -- Dueño: lee y marca leído, pero NO puede reescribir el contenido.
  reset role;
  select set_config('request.jwt.claim.sub', (:usuario_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :usuario_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from avisos where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su aviso'; end if;

    update avisos set leido_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: el dueño no pudo marcar leído'; end if;
    raise notice 'PASS: dueño lee y marca leído';

    begin
      update avisos set titulo = 'reescrito' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
      raise exception 'FAIL: el dueño pudo reescribir el título';
    exception when insufficient_privilege then
      raise notice 'PASS: solo leido_at es actualizable';
    end;

    delete from avisos where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: el dueño no pudo borrar su aviso'; end if;
    raise notice 'PASS: dueño borra su aviso';
  end $$;

rollback;

-- ===========================================================================
-- B — preferencias_avisos: owner-only + checks de dominio
-- ===========================================================================
begin;

  insert into preferencias_avisos (usuario_id, espera_cuidador_min) values (:usuario_id, 60);

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from preferencias_avisos where usuario_id = current_setting('test.usuario')::uuid;
    if n <> 0 then raise exception 'FAIL: otro usuario ve preferencias ajenas'; end if;
    raise notice 'PASS: preferencias ajenas invisibles';

    begin
      insert into preferencias_avisos (usuario_id) values (current_setting('test.usuario')::uuid);
      raise exception 'FAIL: otro usuario pudo insertar preferencias a nombre ajeno';
    exception when insufficient_privilege then
      raise notice 'PASS: insert a nombre ajeno bloqueado';
    end;
  end $$;

  reset role;
  select set_config('request.jwt.claim.sub', (:usuario_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :usuario_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from preferencias_avisos where usuario_id = current_setting('test.usuario')::uuid;
    if n <> 1 then raise exception 'FAIL: el dueño no ve sus preferencias'; end if;

    begin
      update preferencias_avisos set espera_cuidador_min = 45 where usuario_id = current_setting('test.usuario')::uuid;
      raise exception 'FAIL: espera_cuidador_min aceptó un valor fuera de (30, 60, 120)';
    exception when check_violation then
      raise notice 'PASS: espera fuera de dominio rechazada';
    end;

    begin
      update preferencias_avisos set silencio_desde = '23:00' where usuario_id = current_setting('test.usuario')::uuid;
      raise exception 'FAIL: silencio con un solo extremo fue aceptado';
    exception when check_violation then
      raise notice 'PASS: silencio exige desde y hasta';
    end;
  end $$;

rollback;

-- ===========================================================================
-- C — posposiciones: solo sobre dosis propias; ajeno no ve
-- ===========================================================================
begin;

  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia, dias_recurrentes)
  values ('bbbbbbbb-0000-0000-0000-000000000001', :usuario_id, 'Test Avisos', '09:00', 'mañana', '{}');

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    begin
      insert into posposiciones (medicamento_id, usuario_id, fecha, hasta)
      values ('bbbbbbbb-0000-0000-0000-000000000001', current_setting('test.otro')::uuid, current_date, now() + interval '15 minutes');
      raise exception 'FAIL: otro usuario pospuso una dosis ajena';
    exception when insufficient_privilege then
      raise notice 'PASS: posponer dosis ajena bloqueado';
    end;
  end $$;

  reset role;
  select set_config('request.jwt.claim.sub', (:usuario_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :usuario_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    insert into posposiciones (medicamento_id, usuario_id, fecha, hasta)
    values ('bbbbbbbb-0000-0000-0000-000000000001', current_setting('test.usuario')::uuid, current_date, now() + interval '15 minutes');
    select count(*) into n from posposiciones where medicamento_id = 'bbbbbbbb-0000-0000-0000-000000000001';
    if n <> 1 then raise exception 'FAIL: el dueño no pudo posponer su dosis'; end if;
    raise notice 'PASS: dueño pospone su dosis';
  end $$;

  reset role;
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from posposiciones where medicamento_id = 'bbbbbbbb-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'FAIL: otro usuario ve posposiciones ajenas'; end if;
    raise notice 'PASS: posposiciones ajenas invisibles';
  end $$;

rollback;

-- ===========================================================================
-- D — envios_avisos: ningún rol normal lee ni escribe
-- ===========================================================================
begin;

  insert into envios_avisos (tipo, ref_id, fecha, usuario_id)
  values ('dosis_hora', gen_random_uuid(), current_date, :usuario_id);

  select set_config('request.jwt.claim.sub', (:usuario_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :usuario_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from envios_avisos;
    if n <> 0 then raise exception 'FAIL: un usuario autenticado lee envios_avisos'; end if;
    raise notice 'PASS: envios_avisos cerrada';
  end $$;

rollback;
