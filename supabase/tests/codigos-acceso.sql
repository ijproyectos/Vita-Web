-- Acceso por código — RLS de codigos_acceso e intentos_codigo (migración 019).
--
-- Script psql manual (el repo no tiene test runner). Cada sección es una
-- transacción que termina en ROLLBACK: no deja filas. Un FAIL aborta con ERROR.
--
-- Requiere 019 aplicada y TRES cuentas reales de auth.users:
--   elder_id      — persona cuidada (E)
--   cuidador_id   — cuidador (C), con vínculo aceptado a E (se crea acá)
--   otro_id       — usuario sin ningún vínculo (X)
--
-- Run:
--   psql "<pooler>" -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/codigos-acceso.sql
--
-- Nota: las variables :x de psql no se interpolan dentro de DO $$ ... $$, así
-- que se pasan a GUCs con set_config y se leen con current_setting().

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — Cuidador con vínculo aceptado: puede insertar y leer códigos del elder
-- ===========================================================================
begin;
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
  values (:elder_id, :cuidador_id, '', 'aceptado', now());

  select set_config('t.elder', :elder_id, true), set_config('t.cuid', :cuidador_id, true), set_config('t.otro', :otro_id, true);
  select set_config('request.jwt.claim.sub', :cuidador_id, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    insert into codigos_acceso (elder_id, cuidador_id, codigo_hash, salt, expira_at)
    values (current_setting('t.elder')::uuid, current_setting('t.cuid')::uuid, 'h', 's', now() + interval '15 minutes');
    select count(*) into n from codigos_acceso where elder_id = current_setting('t.elder')::uuid;
    if n <> 1 then raise exception 'FAIL: el cuidador vinculado no ve su código (n=%)', n; end if;
    raise notice 'PASS: cuidador vinculado inserta y lee códigos de acceso del elder';
  end $$;
rollback;

-- ===========================================================================
-- 2 — Cuidador SIN vínculo aceptado (o vínculo pendiente) no puede insertar
-- ===========================================================================
begin;
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado)
  values (:elder_id, :cuidador_id, '', 'pendiente');

  select set_config('t.elder', :elder_id, true), set_config('t.cuid', :cuidador_id, true);
  select set_config('request.jwt.claim.sub', :cuidador_id, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    begin
      insert into codigos_acceso (elder_id, cuidador_id, codigo_hash, salt, expira_at)
      values (current_setting('t.elder')::uuid, current_setting('t.cuid')::uuid, 'h', 's', now() + interval '15 minutes');
      raise exception 'FAIL: insert permitido con vínculo pendiente';
    exception when insufficient_privilege then
      raise notice 'PASS: sin vínculo aceptado el insert es rechazado por RLS';
    end;
  end $$;
rollback;

-- ===========================================================================
-- 3 — Usuario no relacionado: no inserta (ni a nombre del cuidador) ni lee;
--     el elder tampoco puede leer los códigos que le generaron.
-- ===========================================================================
begin;
  insert into vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at)
  values (:elder_id, :cuidador_id, '', 'aceptado', now());
  -- fila sembrada como postgres (bypassa RLS)
  insert into codigos_acceso (elder_id, cuidador_id, codigo_hash, salt, expira_at)
  values (:elder_id, :cuidador_id, 'h', 's', now() + interval '15 minutes');

  select set_config('t.elder', :elder_id, true), set_config('t.cuid', :cuidador_id, true), set_config('t.otro', :otro_id, true);

  -- X (sin vínculo)
  select set_config('request.jwt.claim.sub', :otro_id, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from codigos_acceso;
    if n <> 0 then raise exception 'FAIL: usuario no relacionado ve % códigos', n; end if;
    begin
      insert into codigos_acceso (elder_id, cuidador_id, codigo_hash, salt, expira_at)
      values (current_setting('t.elder')::uuid, current_setting('t.otro')::uuid, 'h', 's', now() + interval '15 minutes');
      raise exception 'FAIL: usuario no relacionado pudo insertar';
    exception when insufficient_privilege then
      raise notice 'PASS: usuario no relacionado no lee ni inserta códigos';
    end;
  end $$;

  -- E (el propio elder) no puede leer los códigos de acceso
  reset role;
  select set_config('request.jwt.claim.sub', :elder_id, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from codigos_acceso;
    if n <> 0 then raise exception 'FAIL: el elder lee % códigos de acceso', n; end if;
    raise notice 'PASS: el elder no puede leer codigos_acceso';
  end $$;

  -- Nadie authenticated puede actualizar/borrar (sin policies): 0 filas afectadas
  reset role;
  select set_config('request.jwt.claim.sub', :cuidador_id, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    update codigos_acceso set usado_at = now();
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: el cuidador pudo marcar usado_at (% filas)', n; end if;
    delete from codigos_acceso;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: el cuidador pudo borrar códigos (% filas)', n; end if;
    raise notice 'PASS: sin update/delete para authenticated';
  end $$;
rollback;

-- ===========================================================================
-- 4 — intentos_codigo no es accesible para authenticated ni anon
-- ===========================================================================
begin;
  insert into intentos_codigo (ip_hash) values ('test');
  select set_config('request.jwt.claim.sub', :otro_id, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    begin
      perform 1 from intentos_codigo;
      raise exception 'FAIL: authenticated pudo leer intentos_codigo';
    exception when insufficient_privilege then
      raise notice 'PASS: authenticated no puede leer intentos_codigo';
    end;
  end $$;
  reset role;
  set local role anon;
  do $$
  begin
    begin
      perform 1 from intentos_codigo;
      raise exception 'FAIL: anon pudo leer intentos_codigo';
    exception when insufficient_privilege then
      raise notice 'PASS: anon no puede leer intentos_codigo';
    end;
  end $$;
rollback;
