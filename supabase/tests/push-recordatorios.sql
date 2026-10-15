-- Web Push — RLS negative/positive tests (migración 017).
--
-- Script psql escrito a mano (el repo no tiene test runner). Cada sección es
-- su propia transacción que termina en ROLLBACK, así que correrlo contra la
-- DB real no deja filas. Un run limpio imprime `NOTICE: PASS: ...`; un
-- `FAIL:` aborta la sección.
--
-- Requisitos:
--   1. Migración 017 aplicada.
--   2. Tres cuentas reales (login Google):
--        elder_id    — persona cuidada con al menos una fila en `medicamentos`
--                      (o se inserta una de fixture abajo);
--        cuidador_id — cuidador (se crea el vínculo aceptado dentro de la
--                      sección, y se revierte);
--        otro_id     — usuario SIN ningún vínculo con el elder.
--   3. Conectar con el rol `postgres` del pooler (bypassa RLS para fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/push-recordatorios.sql
--
-- Nota: psql NO interpola :variables dentro de bloques DO $$ — por eso los
-- ids se pasan a los bloques via set_config('test.*') y se leen con
-- current_setting().

\set ON_ERROR_STOP on

select set_config('test.elder', (:elder_id)::text, false);
select set_config('test.cuidador', (:cuidador_id)::text, false);
select set_config('test.otro', (:otro_id)::text, false);

-- ===========================================================================
-- A — push_suscripciones: solo el dueño ve/inserta/borra lo suyo
-- ===========================================================================
begin;

  insert into push_suscripciones (usuario_id, endpoint, p256dh, auth)
  values (:elder_id, 'https://push.example.test/elder', 'p', 'a');

  -- Otro usuario: no ve la fila del elder.
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from push_suscripciones where endpoint = 'https://push.example.test/elder';
    if n <> 0 then raise exception 'FAIL: otro usuario ve la suscripción del elder'; end if;
    raise notice 'PASS: suscripción ajena invisible';
  end $$;

  do $$
  begin
    begin
      insert into push_suscripciones (usuario_id, endpoint, p256dh, auth)
      values (current_setting('test.elder')::uuid, 'https://push.example.test/forzada', 'p', 'a');
      raise exception 'FAIL: otro usuario pudo insertar una suscripción a nombre del elder';
    exception when insufficient_privilege then
      raise notice 'PASS: insert a nombre de otro bloqueado';
    end;
  end $$;

  do $$
  declare n int;
  begin
    delete from push_suscripciones where endpoint = 'https://push.example.test/elder';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario borró la suscripción del elder'; end if;
    raise notice 'PASS: delete ajeno no afecta filas';
  end $$;

  -- El dueño sí ve la suya.
  reset role;
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from push_suscripciones where endpoint = 'https://push.example.test/elder';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su suscripción'; end if;
    raise notice 'PASS: dueño ve su suscripción';
  end $$;

rollback;

-- ===========================================================================
-- B — recordatorios_dosis: cuidador vinculado inserta; ajeno no; elder lee
-- ===========================================================================
begin;

  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
  values (:elder_id, :cuidador_id, 'push-test@example.com', 'aceptado', now());

  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia, dias_recurrentes)
  values ('22222222-2222-2222-2222-222222222222', :elder_id, 'Test Push', '09:00', 'mañana', '{}');

  -- Cuidador vinculado: puede insertar y leer.
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    insert into recordatorios_dosis (medicamento_id, elder_id, cuidador_id, fecha)
    values ('22222222-2222-2222-2222-222222222222', current_setting('test.elder')::uuid,
            current_setting('test.cuidador')::uuid, current_date);
    select count(*) into n from recordatorios_dosis where medicamento_id = '22222222-2222-2222-2222-222222222222';
    if n <> 1 then raise exception 'FAIL: el cuidador no ve su recordatorio'; end if;
    raise notice 'PASS: cuidador vinculado inserta y lee';
  end $$;

  -- Cuidador intentando firmar como otro cuidador: bloqueado.
  do $$
  begin
    begin
      insert into recordatorios_dosis (medicamento_id, elder_id, cuidador_id, fecha)
      values ('22222222-2222-2222-2222-222222222222', current_setting('test.elder')::uuid,
              current_setting('test.otro')::uuid, current_date);
      raise exception 'FAIL: pudo insertar con cuidador_id ajeno';
    exception when insufficient_privilege then
      raise notice 'PASS: cuidador_id debe ser auth.uid()';
    end;
  end $$;

  -- Usuario sin vínculo: no puede insertar ni ver.
  reset role;
  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    begin
      insert into recordatorios_dosis (medicamento_id, elder_id, cuidador_id, fecha)
      values ('22222222-2222-2222-2222-222222222222', current_setting('test.elder')::uuid,
              current_setting('test.otro')::uuid, current_date);
      raise exception 'FAIL: usuario sin vínculo pudo insertar un recordatorio';
    exception when insufficient_privilege then
      raise notice 'PASS: usuario sin vínculo no puede insertar';
    end;
    select count(*) into n from recordatorios_dosis;
    if n <> 0 then raise exception 'FAIL: usuario sin vínculo ve recordatorios'; end if;
    raise notice 'PASS: usuario sin vínculo no ve recordatorios';
  end $$;

  -- El elder lee el recordatorio dirigido a él.
  reset role;
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from recordatorios_dosis where medicamento_id = '22222222-2222-2222-2222-222222222222';
    if n <> 1 then raise exception 'FAIL: el elder no ve su recordatorio'; end if;
    raise notice 'PASS: elder lee sus recordatorios';
  end $$;

rollback;
