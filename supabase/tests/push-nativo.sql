-- Push nativo (FCM) — RLS y RPC tests (migración 065).
--
-- Script psql escrito a mano (el repo no tiene test runner). Cada sección es
-- su propia transacción que termina en ROLLBACK, así que correrlo contra la
-- DB real no deja filas. Un run limpio imprime `NOTICE: PASS: ...`; un
-- `FAIL:` aborta la sección.
--
-- Requisitos:
--   1. Migración 065 aplicada (NO está aplicada todavía).
--   2. Dos cuentas reales (login Google): usuario_a y usuario_b.
--   3. Conectar con el rol `postgres` del pooler (bypassa RLS para fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v usuario_a="'<uuid>'" -v usuario_b="'<uuid>'" \
--     -f supabase/tests/push-nativo.sql
--
-- Nota: psql NO interpola :variables dentro de bloques DO $$ — por eso los
-- ids se pasan a los bloques via set_config('test.*') y se leen con
-- current_setting().

\set ON_ERROR_STOP on

select set_config('test.a', (:usuario_a)::text, false);
select set_config('test.b', (:usuario_b)::text, false);

-- ===========================================================================
-- A — push_tokens_nativos: solo el dueño ve/inserta/borra lo suyo
-- ===========================================================================
begin;

  insert into push_tokens_nativos (usuario_id, token, plataforma)
  values (:usuario_a, 'token-test-a', 'android');

  select set_config('request.jwt.claim.sub', (:usuario_b)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :usuario_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from push_tokens_nativos where token = 'token-test-a';
    if n <> 0 then raise exception 'FAIL: otro usuario ve el token ajeno'; end if;
    raise notice 'PASS: token ajeno invisible';
  end $$;

  do $$
  begin
    begin
      insert into push_tokens_nativos (usuario_id, token, plataforma)
      values (current_setting('test.a')::uuid, 'token-test-forzado', 'android');
      raise exception 'FAIL: otro usuario pudo insertar un token a nombre ajeno';
    exception when insufficient_privilege then
      raise notice 'PASS: insert a nombre de otro bloqueado';
    end;
  end $$;

  do $$
  declare n int;
  begin
    delete from push_tokens_nativos where token = 'token-test-a';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario borró el token ajeno'; end if;
    raise notice 'PASS: borrado ajeno sin efecto';
  end $$;

rollback;

-- ===========================================================================
-- B — registrar_push_token_nativo: upsert propio y reasignación entre cuentas
-- ===========================================================================
begin;

  insert into push_tokens_nativos (usuario_id, token, plataforma)
  values (:usuario_a, 'token-test-compartido', 'android');

  select set_config('request.jwt.claim.sub', (:usuario_b)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :usuario_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select registrar_push_token_nativo('token-test-compartido', 'android', '1.0.0');

  do $$
  declare dueno uuid; n int;
  begin
    select usuario_id into dueno from push_tokens_nativos where token = 'token-test-compartido';
    if dueno is distinct from current_setting('test.b')::uuid then
      raise exception 'FAIL: el token no se reasignó a la cuenta que lo registró';
    end if;
    select count(*) into n from push_tokens_nativos where token = 'token-test-compartido';
    if n <> 1 then raise exception 'FAIL: el upsert duplicó el token'; end if;
    raise notice 'PASS: token reasignado sin duplicar';
  end $$;

  do $$
  begin
    begin
      perform registrar_push_token_nativo('token-test-ios-raro', 'windows', null);
      raise exception 'FAIL: plataforma inválida aceptada';
    exception when check_violation then
      raise notice 'PASS: plataforma inválida rechazada';
    end;
  end $$;

rollback;

-- ===========================================================================
-- C — la RPC exige sesión (anon no puede ejecutarla)
-- ===========================================================================
begin;

  set local role anon;

  do $$
  begin
    begin
      perform registrar_push_token_nativo('token-test-anon', 'android', null);
      raise exception 'FAIL: anon pudo registrar un token';
    exception when insufficient_privilege then
      raise notice 'PASS: anon sin permiso de ejecución';
    end;
  end $$;

rollback;
