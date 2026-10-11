-- Compartir con profesional — RLS/RPC tests for migration 015
-- (enlaces_profesional + resumen_profesional).
--
-- Hand-written psql script, same style as inventario-pastillas.sql: each
-- section is its own transaction that ROLLBACKs, so running it against the
-- live DB leaves no fixture rows behind. A clean run prints one
-- `NOTICE: PASS: ...` per assertion; any `FAIL:` aborts that section.
--
-- Prerequisites:
--   1. Migration 015 (`015_enlaces_profesional.sql`) applied (and 014, which
--      the summary joins for remaining pills).
--   2. Two REAL existing accounts: owner_id (O, owns the links) and otro_id
--      (X, unrelated user).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- psql :vars are NOT interpolated inside DO $$ blocks, so ids travel through
-- set_config/current_setting ('t.owner', 't.otro').
--
-- Run:
--   psql "<pooler connection string>" \
--     -v owner_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/enlaces-profesional.sql

\set ON_ERROR_STOP on

-- Hash helper used by fixtures: same expression as the RPC.
-- sha256('tok-valido') etc. are computed inline below.

-- ===========================================================================
-- 1 — Valid token (as anon): summary returned, no email, access counted
-- ===========================================================================
begin;

  select set_config('t.owner', (:owner_id)::text, true);
  select set_config('t.otro', (:otro_id)::text, true);

  insert into enlaces_profesional (usuario_id, token_hash, etiqueta, expira_at)
  values (:owner_id, encode(sha256(convert_to('tok-valido', 'UTF8')), 'hex'), 'Dra. Test', now() + interval '1 day');

  set local role anon;

  do $$
  declare
    r jsonb;
  begin
    r := resumen_profesional('tok-valido');
    if r is null then
      raise exception 'FAIL: 1a valid token returned null';
    end if;
    raise notice 'PASS: 1a valid token returns a summary';

    if not (r ? 'paciente' and r ? 'condiciones' and r ? 'alergias' and r ? 'medicamentos'
            and r ? 'adherencia' and r ? 'turnos' and r ? 'estudios' and r ? 'contacto_emergencia') then
      raise exception 'FAIL: 1b summary is missing sections: %', (select array_agg(k) from jsonb_object_keys(r) k);
    end if;
    raise notice 'PASS: 1b summary has all sections';

    if r::text ~* '"email' or r::text ~* 'archivo_path' or r::text ~* 'usuario_id' or r::text ~* 'mensajes' then
      raise exception 'FAIL: 1c summary leaks a forbidden key';
    end if;
    if (r->'paciente') ? 'email' or r ? 'email' then
      raise exception 'FAIL: 1c summary has an email key';
    end if;
    raise notice 'PASS: 1c summary has no email / ids / file paths / chat';

    if jsonb_array_length(r->'adherencia'->'por_dia') <> 14 then
      raise exception 'FAIL: 1d adherence should list 14 days, got %', jsonb_array_length(r->'adherencia'->'por_dia');
    end if;
    raise notice 'PASS: 1d adherence covers 14 days';
  end $$;

  reset role;

  do $$
  declare
    a int;
  begin
    select e.accesos into a from enlaces_profesional e
    where e.token_hash = encode(sha256(convert_to('tok-valido', 'UTF8')), 'hex');
    if a <> 1 then
      raise exception 'FAIL: 1e expected accesos = 1 after one view, got %', a;
    end if;
    raise notice 'PASS: 1e access counter bumped';
  end $$;

rollback;

-- ===========================================================================
-- 2 — Wrong / empty / null token => null
-- ===========================================================================
begin;

  select set_config('t.owner', (:owner_id)::text, true);

  insert into enlaces_profesional (usuario_id, token_hash, expira_at)
  values (:owner_id, encode(sha256(convert_to('tok-valido', 'UTF8')), 'hex'), now() + interval '1 day');

  set local role anon;

  do $$
  begin
    if resumen_profesional('tok-incorrecto') is not null then
      raise exception 'FAIL: 2a wrong token returned data';
    end if;
    if resumen_profesional('') is not null or resumen_profesional(null) is not null then
      raise exception 'FAIL: 2b empty/null token returned data';
    end if;
    raise notice 'PASS: 2 wrong, empty and null tokens return null';
  end $$;

rollback;

-- ===========================================================================
-- 3 — Expired => null (and no access counted)
-- ===========================================================================
begin;

  select set_config('t.owner', (:owner_id)::text, true);

  insert into enlaces_profesional (usuario_id, token_hash, expira_at)
  values (:owner_id, encode(sha256(convert_to('tok-vencido', 'UTF8')), 'hex'), now() - interval '1 minute');

  set local role anon;

  do $$
  begin
    if resumen_profesional('tok-vencido') is not null then
      raise exception 'FAIL: 3a expired token returned data';
    end if;
    raise notice 'PASS: 3a expired token returns null';
  end $$;

  reset role;

  do $$
  declare
    a int;
  begin
    select e.accesos into a from enlaces_profesional e
    where e.token_hash = encode(sha256(convert_to('tok-vencido', 'UTF8')), 'hex');
    if a <> 0 then
      raise exception 'FAIL: 3b expired view was counted (accesos = %)', a;
    end if;
    raise notice 'PASS: 3b expired view not counted';
  end $$;

rollback;

-- ===========================================================================
-- 4 — Revoked => null
-- ===========================================================================
begin;

  insert into enlaces_profesional (usuario_id, token_hash, expira_at, revocado_at)
  values (:owner_id, encode(sha256(convert_to('tok-revocado', 'UTF8')), 'hex'), now() + interval '1 day', now());

  set local role anon;

  do $$
  begin
    if resumen_profesional('tok-revocado') is not null then
      raise exception 'FAIL: 4 revoked token returned data';
    end if;
    raise notice 'PASS: 4 revoked token returns null';
  end $$;

rollback;

-- ===========================================================================
-- 5 — anon cannot read the table directly
-- ===========================================================================
begin;

  insert into enlaces_profesional (usuario_id, token_hash, expira_at)
  values (:owner_id, encode(sha256(convert_to('tok-valido', 'UTF8')), 'hex'), now() + interval '1 day');

  set local role anon;

  do $$
  declare
    n int;
  begin
    select count(*) into n from enlaces_profesional;
    if n <> 0 then
      raise exception 'FAIL: 5 anon read % rows from enlaces_profesional', n;
    end if;
    raise notice 'PASS: 5 anon sees 0 rows (RLS)';
  exception
    when insufficient_privilege then
      raise notice 'PASS: 5 anon has no privilege on enlaces_profesional';
  end $$;

rollback;

-- ===========================================================================
-- 6 — Another user cannot see, revoke or delete someone else's links
-- ===========================================================================
begin;

  select set_config('t.owner', (:owner_id)::text, true);
  select set_config('t.otro', (:otro_id)::text, true);

  insert into enlaces_profesional (id, usuario_id, token_hash, expira_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', :owner_id,
          encode(sha256(convert_to('tok-valido', 'UTF8')), 'hex'), now() + interval '1 day');

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from enlaces_profesional where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    if n <> 0 then
      raise exception 'FAIL: 6a other user sees % foreign links', n;
    end if;
    raise notice 'PASS: 6a other user cannot see foreign links';

    update enlaces_profesional set revocado_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL: 6b other user revoked % foreign links', n;
    end if;
    raise notice 'PASS: 6b other user cannot revoke foreign links';

    delete from enlaces_profesional where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL: 6c other user deleted % foreign links', n;
    end if;
    raise notice 'PASS: 6c other user cannot delete foreign links';
  end $$;

  do $$
  begin
    insert into enlaces_profesional (usuario_id, token_hash, expira_at)
    values (current_setting('t.owner')::uuid, 'hash-ajeno', now() + interval '1 day');
    raise exception 'FAIL: 6d other user inserted a link for someone else';
  exception
    when insufficient_privilege then
      raise notice 'PASS: 6d cannot insert a link on behalf of another user';
  end $$;

rollback;

-- ===========================================================================
-- 7 — Owner sees and revokes own link; revoked link stops working
-- ===========================================================================
begin;

  select set_config('t.owner', (:owner_id)::text, true);

  insert into enlaces_profesional (id, usuario_id, token_hash, expira_at)
  values ('bbbbbbbb-0000-0000-0000-000000000002', :owner_id,
          encode(sha256(convert_to('tok-valido', 'UTF8')), 'hex'), now() + interval '1 day');

  select set_config('request.jwt.claim.sub', (:owner_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from enlaces_profesional where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    if n <> 1 then
      raise exception 'FAIL: 7a owner cannot see own link';
    end if;
    raise notice 'PASS: 7a owner sees own link';

    update enlaces_profesional set revocado_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'FAIL: 7b owner could not revoke own link';
    end if;
    raise notice 'PASS: 7b owner revokes own link';

    if resumen_profesional('tok-valido') is not null then
      raise exception 'FAIL: 7c revoked link still returns data';
    end if;
    raise notice 'PASS: 7c revoked link no longer works';
  end $$;

rollback;
