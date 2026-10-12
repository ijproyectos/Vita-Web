-- Autovinculo — tests for migration 016 (bloquear_autovinculo).
--
-- Hand-written psql script, same style as inventario-pastillas.sql: each
-- section is its own transaction that ROLLBACKs, so no fixture rows remain.
-- A clean run prints one `NOTICE: PASS: ...` per assertion.
--
-- Prerequisites:
--   1. Migrations 010/012 and 016 applied.
--   2. Two REAL existing accounts: cuidador_id (C) and elder_id (E).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v cuidador_id="'<uuid>'" -v elder_id="'<uuid>'" \
--     -f supabase/tests/autovinculo.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — The caregiver claiming their own code is rejected
-- ===========================================================================
begin;

  insert into vinculos_cuidador (id, cuidador_id, elder_id, email_invitado, codigo, expira_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', :cuidador_id, null, '', '987651', now() + interval '30 minutes');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    perform * from reclamar_vinculo_como_elder('987651');
    raise exception 'FAIL: 1 caregiver claimed their own code';
  exception when others then
    if sqlerrm <> 'autovinculo_no_permitido' then
      raise exception 'FAIL: 1 expected autovinculo_no_permitido, got %', sqlerrm;
    end if;
    raise notice 'PASS: 1 self-claim rejected with autovinculo_no_permitido';
  end $$;

rollback;

-- ===========================================================================
-- 2 — A different user claiming it succeeds
-- ===========================================================================
begin;

  insert into vinculos_cuidador (id, cuidador_id, elder_id, email_invitado, codigo, expira_at)
  values ('bbbbbbbb-0000-0000-0000-000000000002', :cuidador_id, null, '', '987652', now() + interval '30 minutes');

  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    perform * from reclamar_vinculo_como_elder('987652');
    select count(*) into n from vinculos_cuidador vc
    where vc.id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and vc.estado = 'aceptado' and vc.elder_id = (current_setting('request.jwt.claim.sub'))::uuid;
    if n <> 1 then
      raise exception 'FAIL: 2 link not accepted for another user (% rows)', n;
    end if;
    raise notice 'PASS: 2 a different user claims the code';
  end $$;

rollback;

-- ===========================================================================
-- 3 — CHECK constraint: cuidador_id = elder_id cannot be inserted
-- ===========================================================================
begin;

  -- psql :vars are not interpolated inside DO $$ blocks.
  select set_config('app.cuidador', (:cuidador_id)::text, true);

  do $$
  begin
    insert into vinculos_cuidador (cuidador_id, elder_id, email_invitado, estado)
    values (current_setting('app.cuidador')::uuid, current_setting('app.cuidador')::uuid, '', 'aceptado');
    raise exception 'FAIL: 3 self-linked row was inserted';
  exception when check_violation then
    raise notice 'PASS: 3 insert with cuidador_id = elder_id violates the check';
  end $$;

rollback;
