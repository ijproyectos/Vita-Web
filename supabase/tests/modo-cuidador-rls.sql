-- Modo Cuidador — RED-first RLS/RPC negative tests (tasks 4.1-4.4).
--
-- Hand-written psql script, NOT an automated test framework (this repo has
-- none — see root CLAUDE.md). Each section is its own transaction that
-- ROLLBACKs at the end, so running this against the live DB never leaves
-- fixture rows behind. Assertions use plain `DO $$ ... RAISE EXCEPTION`
-- blocks: a clean run prints one `NOTICE: PASS: ...` per assertion and
-- exits 0; any `FAIL:` (raised as an ERROR, aborting that section's
-- transaction) means the RLS/RPC behavior regressed.
--
-- Prerequisites (all MUST be true before running):
--   1. Migration 008 (`supabase/migrations/008_cuidadores.sql`) is applied
--      to the target DB — task 1.4, still pending at the time this script
--      was written (no DB password was available to this batch).
--   2. Three REAL, already-existing accounts (created via actual Google
--      login, matching this app's Google-only auth) are known:
--       - elder_id     — an elder account (E1) that owns at least one
--                         `medicamentos` row (created via the app first,
--                         or insert one inside the fixture below).
--       - elder2_id     — a second, UNRELATED elder account (E2), with no
--                         caregiver link to `cuidador_id` at all.
--       - cuidador_id   — a caregiver account (C), reused across sections;
--                         each section creates/resets its own
--                         `vinculos_cuidador` fixture row for C, so C's
--                         link state from one section never leaks into the
--                         next (every section rolls back).
--   3. Connect as a role that can bypass RLS to set up fixtures (the
--      `postgres` pooler role used throughout this project — see root
--      CLAUDE.md "Infra").
--
-- Run:
--   psql "<pooler connection string>" \
--     -v elder_id="'<uuid>'" -v elder2_id="'<uuid>'" -v cuidador_id="'<uuid>'" \
--     -f supabase/tests/modo-cuidador-rls.sql
--
-- `auth.uid()` inside a policy/RPC reads from the PostgREST-style GUCs
-- below — setting both `request.jwt.claim.sub` and `request.jwt.claims`
-- covers this project's Supabase auth.uid() implementation without having
-- to paste a real signed JWT.

\set ON_ERROR_STOP on

-- ===========================================================================
-- 4.1 — Caregiver Access Is Read-Only
-- (req: Caregiver Access Is Read-Only — write attempt blocked)
-- ===========================================================================
begin;

  -- Fixture: accepted link E1<->C, one medicamento owned by E1.
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
  values (:elder_id, :cuidador_id, 'caregiver-test@example.com', 'aceptado', now());

  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia, dias_recurrentes)
  values ('11111111-1111-1111-1111-111111111111', :elder_id, 'Test RLS', '09:00', 'mañana', '{}');

  -- Act as caregiver C.
  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    filas_afectadas int;
  begin
    update medicamentos set nombre = 'Hackeado' where id = '11111111-1111-1111-1111-111111111111';
    get diagnostics filas_afectadas = row_count;
    if filas_afectadas <> 0 then
      raise exception 'FAIL: 4.1 caregiver UPDATE medicamentos affected % rows, expected 0', filas_afectadas;
    end if;
    raise notice 'PASS: 4.1a caregiver UPDATE medicamentos affected 0 rows';
  end $$;

  do $$
  declare
    filas_afectadas int;
  begin
    delete from medicamentos where id = '11111111-1111-1111-1111-111111111111';
    get diagnostics filas_afectadas = row_count;
    if filas_afectadas <> 0 then
      raise exception 'FAIL: 4.1 caregiver DELETE medicamentos affected % rows, expected 0', filas_afectadas;
    end if;
    raise notice 'PASS: 4.1b caregiver DELETE medicamentos affected 0 rows';
  end $$;

  do $$
  declare
    filas_afectadas int;
  begin
    insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado)
    values ('11111111-1111-1111-1111-111111111111', :elder_id, current_date, true);
    get diagnostics filas_afectadas = row_count;
    if filas_afectadas <> 0 then
      raise exception 'FAIL: 4.1 caregiver INSERT medicamentos_tomas affected % rows, expected 0', filas_afectadas;
    end if;
    raise notice 'PASS: 4.1c caregiver INSERT medicamentos_tomas affected 0 rows';
  exception
    when insufficient_privilege then
      raise notice 'PASS: 4.1c caregiver INSERT medicamentos_tomas rejected (insufficient_privilege)';
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 4.2a — Pending link grants zero access
-- (req: Caregiver Reads Linked Elder's Medication Data — pending link)
-- ===========================================================================
begin;

  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado)
  values (:elder_id, :cuidador_id, 'caregiver-test@example.com', 'pendiente');

  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia, dias_recurrentes)
  values ('22222222-2222-2222-2222-222222222222', :elder_id, 'Test pendiente', '09:00', 'mañana', '{}');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from medicamentos where usuario_id = :elder_id;
    if n <> 0 then
      raise exception 'FAIL: 4.2a pending-link caregiver saw % rows of elder medicamentos, expected 0', n;
    end if;
    raise notice 'PASS: 4.2a pending-link caregiver sees 0 rows';
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 4.2b — Cross-elder isolation
-- (req: Caregiver Cannot Access Unlinked Elders)
-- ===========================================================================
begin;

  -- C is accepted-linked to E1 only — E2 is completely unrelated.
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
  values (:elder_id, :cuidador_id, 'caregiver-test@example.com', 'aceptado', now());

  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia, dias_recurrentes)
  values ('33333333-3333-3333-3333-333333333333', :elder2_id, 'Test E2', '09:00', 'mañana', '{}');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from medicamentos where usuario_id = :elder2_id;
    if n <> 0 then
      raise exception 'FAIL: 4.2b caregiver linked only to E1 saw % rows of unrelated E2, expected 0', n;
    end if;
    raise notice 'PASS: 4.2b cross-elder isolation holds (0 rows for E2)';
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 4.3 — reclamar_invitacion_cuidador rejections
-- (req: Claim rejected for wrong account, Expired token rejected,
--  Revoked invite cannot be claimed)
-- ===========================================================================
begin;

  -- Wrong account: token was issued for an email that does NOT belong to
  -- the authenticated caregiver (the RPC compares against auth.users.email,
  -- so this only produces the expected rejection if `cuidador_id`'s real
  -- account email is not "nadie@example.com" — true for any real account).
  insert into vinculos_cuidador (elder_id, email_invitado, token, estado)
  values (:elder_id, 'nadie@example.com', 'test-token-wrong-account', 'pendiente');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    perform reclamar_invitacion_cuidador('test-token-wrong-account');
    raise exception 'FAIL: 4.3a claim with wrong-account email did not raise';
  exception
    when others then
      if sqlerrm = 'invitacion_no_corresponde_a_esta_cuenta' then
        raise notice 'PASS: 4.3a wrong-account claim rejected';
      else
        raise exception 'FAIL: 4.3a unexpected error: %', sqlerrm;
      end if;
  end $$;

  do $$
  declare
    estado_actual text;
  begin
    select estado into estado_actual from vinculos_cuidador where token = 'test-token-wrong-account';
    if estado_actual <> 'pendiente' then
      raise exception 'FAIL: 4.3a link mutated after rejected claim, estado=%', estado_actual;
    end if;
    raise notice 'PASS: 4.3a link untouched after rejected claim';
  end $$;

reset role;
rollback;

begin;

  -- Expired token.
  insert into vinculos_cuidador (elder_id, email_invitado, token, estado, expira_at)
  values (:elder_id, 'caregiver-test@example.com', 'test-token-expired', 'pendiente', now() - interval '1 hour');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    perform reclamar_invitacion_cuidador('test-token-expired');
    raise exception 'FAIL: 4.3b claim of expired token did not raise';
  exception
    when others then
      if sqlerrm = 'invitacion_expirada' then
        raise notice 'PASS: 4.3b expired-token claim rejected';
      else
        raise exception 'FAIL: 4.3b unexpected error: %', sqlerrm;
      end if;
  end $$;

reset role;
rollback;

begin;

  -- Revoked invite: no matching 'pendiente' row for that token at all.
  insert into vinculos_cuidador (elder_id, email_invitado, token, estado)
  values (:elder_id, 'caregiver-test@example.com', 'test-token-revoked', 'revocado');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    perform reclamar_invitacion_cuidador('test-token-revoked');
    raise exception 'FAIL: 4.3c claim of revoked token did not raise';
  exception
    when others then
      if sqlerrm = 'invitacion_no_encontrada' then
        raise notice 'PASS: 4.3c revoked-token claim rejected';
      else
        raise exception 'FAIL: 4.3c unexpected error: %', sqlerrm;
      end if;
  end $$;

reset role;
rollback;

-- ===========================================================================
-- 4.4 — Duplicate invite reissues token, does not duplicate the row
-- (req: Duplicate invite reissued, not duplicated)
-- ===========================================================================
begin;

  insert into vinculos_cuidador (elder_id, email_invitado, token, estado)
  values (:elder_id, 'reinvite-test@example.com', 'test-token-original', 'pendiente');

  -- Act as the elder (owns the row via `vinculos_all_elder`).
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Mirrors lib/cuidadores/nucleo.ts `invitar()`: reissue the token on the
  -- existing pending row for elder+email instead of inserting a new one.
  update vinculos_cuidador
  set token = 'test-token-reissued', expira_at = now() + interval '7 days'
  where elder_id = :elder_id and email_invitado = 'reinvite-test@example.com' and estado = 'pendiente';

  do $$
  declare
    n int;
    token_actual text;
  begin
    select count(*) into n from vinculos_cuidador
      where elder_id = :elder_id and email_invitado = 'reinvite-test@example.com';
    if n <> 1 then
      raise exception 'FAIL: 4.4 expected exactly 1 row for elder+email after reissue, got %', n;
    end if;

    select token into token_actual from vinculos_cuidador
      where elder_id = :elder_id and email_invitado = 'reinvite-test@example.com';
    if token_actual <> 'test-token-reissued' then
      raise exception 'FAIL: 4.4 token not reissued, still %', token_actual;
    end if;

    raise notice 'PASS: 4.4 duplicate invite reissued token on the same row, no duplicate';
  end $$;

reset role;
rollback;

\echo 'All modo-cuidador RLS/RPC sections completed — read above for PASS/FAIL per assertion.'
