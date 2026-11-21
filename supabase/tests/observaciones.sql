-- Observaciones de vita (etapa 1) — tests de la migración 062: tabla `observaciones`, RLS y grants por columna.
--
-- Script psql escrito a mano, mismo estilo que familia.sql: cada sección es su propia transacción que termina en
-- ROLLBACK, así que no queda ninguna fila de prueba (los vínculos entre estas cuentas que existan se borran DENTRO de
-- la transacción y vuelven con el rollback). Una corrida limpia imprime un `NOTICE: PASS: ...` por cada aserción.
--
-- Requisitos:
--   1. Migraciones hasta la 062 aplicadas.
--   2. Tres cuentas REALES de auth.users: owner_id (E, la persona), cuidador_id (C, será cuidador de E) y otro_id
--      (O, sin relación con E).
--   3. Conectar con el rol `postgres` del pooler (saltea RLS para armar los datos).
--
-- Correr:
--   psql "<cadena del pooler>" \
--     -v owner_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/observaciones.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — El dueño: lee lo suyo (no `familia_sin_tomas`), solo cambia vista/descartada, borra lo suyo, no inserta
-- ===========================================================================
begin;

  delete from vinculos_cuidador where elder_id = :owner_id and cuidador_id in (:cuidador_id, :otro_id);

  insert into observaciones (id, usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta) values
    ('dddddddd-0000-0000-0000-000000000001', :owner_id, 'presion_alta', 'atencion', 'test:presion:1', 'Presión alta', 'texto', now() + interval '3 days'),
    ('dddddddd-0000-0000-0000-000000000002', :owner_id, 'familia_sin_tomas', 'atencion', 'test:familia:1', 'No marcó tomas', 'texto', now() + interval '3 days');

  select set_config('request.jwt.claim.sub', (:owner_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from observaciones where clave like 'test:%';
    if n <> 1 then raise exception 'FAIL: 1a el dueño debería ver 1 (no la de familia), vio %', n; end if;
    raise notice 'PASS: 1a el dueño no ve familia_sin_tomas';

    update observaciones set vista_at = now(), descartada_at = now() where id = 'dddddddd-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1b el dueño no pudo marcar vista/descartada'; end if;
    raise notice 'PASS: 1b el dueño marca vista y descartada';

    begin
      update observaciones set titulo = 'hackeado' where id = 'dddddddd-0000-0000-0000-000000000001';
      raise exception 'FAIL: 1c el dueño pudo cambiar el título';
    exception when insufficient_privilege then
      raise notice 'PASS: 1c el dueño no puede cambiar otras columnas';
    end;

    begin
      update observaciones set vigente_hasta = now() + interval '1 year' where id = 'dddddddd-0000-0000-0000-000000000001';
      raise exception 'FAIL: 1d el dueño pudo cambiar vigente_hasta';
    exception when insufficient_privilege then
      raise notice 'PASS: 1d el dueño no puede alargar la vigencia';
    end;

    begin
      insert into observaciones (usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta)
      values (auth.uid(), 'presion_alta', 'atencion', 'test:propia', 't', 't', now() + interval '1 day');
      raise exception 'FAIL: 1e el dueño pudo insertar';
    exception when insufficient_privilege then
      raise notice 'PASS: 1e el dueño no inserta (solo service_role)';
    end;

    delete from observaciones where id = 'dddddddd-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 1f el dueño no pudo borrar lo suyo'; end if;
    raise notice 'PASS: 1f el dueño borra lo suyo (Borrar historial)';

    delete from observaciones where id = 'dddddddd-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 1g el dueño borró una observación de familia'; end if;
    raise notice 'PASS: 1g el dueño no toca familia_sin_tomas';
  end $$;

rollback;

-- ===========================================================================
-- 2 — Cuidador con rol 'editar': lee TODO lo de E (incluida familia_sin_tomas) y puede marcar vista/descartada
-- ===========================================================================
begin;

  delete from vinculos_cuidador where elder_id = :owner_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-0000000000c1', :owner_id, :cuidador_id, '', 'aceptado', now(), 'editar');

  insert into observaciones (id, usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta) values
    ('dddddddd-0000-0000-0000-000000000011', :owner_id, 'presion_alta', 'atencion', 'test:presion:2', 'Presión alta', 'texto', now() + interval '3 days'),
    ('dddddddd-0000-0000-0000-000000000012', :owner_id, 'familia_sin_tomas', 'atencion', 'test:familia:2', 'No marcó tomas', 'texto', now() + interval '3 days');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from observaciones where clave like 'test:%';
    if n <> 2 then raise exception 'FAIL: 2a el editor debería ver 2, vio %', n; end if;
    raise notice 'PASS: 2a el editor ve las dos (incluida familia_sin_tomas)';

    update observaciones set descartada_at = now() where id = 'dddddddd-0000-0000-0000-000000000012';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: 2b el editor no pudo descartar'; end if;
    raise notice 'PASS: 2b el editor descarta';

    begin
      update observaciones set texto = 'otro' where id = 'dddddddd-0000-0000-0000-000000000011';
      raise exception 'FAIL: 2c el editor pudo cambiar el texto';
    exception when insufficient_privilege then
      raise notice 'PASS: 2c el editor no cambia otras columnas';
    end;

    delete from observaciones where id = 'dddddddd-0000-0000-0000-000000000011';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 2d el editor borró una observación ajena'; end if;
    raise notice 'PASS: 2d el editor no borra';
  end $$;

rollback;

-- ===========================================================================
-- 3 — Cuidador con rol 'ver': lee lo de E salvo familia_sin_tomas y NO escribe
-- ===========================================================================
begin;

  delete from vinculos_cuidador where elder_id = :owner_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-0000000000c2', :owner_id, :cuidador_id, '', 'aceptado', now(), 'ver');

  insert into observaciones (id, usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta) values
    ('dddddddd-0000-0000-0000-000000000021', :owner_id, 'presion_alta', 'atencion', 'test:presion:3', 'Presión alta', 'texto', now() + interval '3 days'),
    ('dddddddd-0000-0000-0000-000000000022', :owner_id, 'familia_sin_tomas', 'atencion', 'test:familia:3', 'No marcó tomas', 'texto', now() + interval '3 days');

  select set_config('request.jwt.claim.sub', (:cuidador_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from observaciones where clave like 'test:%';
    if n <> 1 then raise exception 'FAIL: 3a el lector debería ver 1, vio %', n; end if;
    raise notice 'PASS: 3a el lector ve la de presión pero no familia_sin_tomas';

    update observaciones set descartada_at = now() where id = 'dddddddd-0000-0000-0000-000000000021';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 3b el lector pudo descartar'; end if;
    raise notice 'PASS: 3b el lector no descarta';

    update observaciones set vista_at = now() where id = 'dddddddd-0000-0000-0000-000000000021';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 3c el lector pudo marcar vista'; end if;
    raise notice 'PASS: 3c el lector no marca vista';
  end $$;

rollback;

-- ===========================================================================
-- 4 — Una cuenta sin relación con E no ve ni toca nada
-- ===========================================================================
begin;

  delete from vinculos_cuidador where elder_id = :owner_id and cuidador_id in (:cuidador_id, :otro_id);
  insert into observaciones (id, usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta)
  values ('dddddddd-0000-0000-0000-000000000031', :owner_id, 'presion_alta', 'atencion', 'test:presion:4', 'Presión alta', 'texto', now() + interval '3 days');

  select set_config('request.jwt.claim.sub', (:otro_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
  begin
    select count(*) into n from observaciones where clave like 'test:%';
    if n <> 0 then raise exception 'FAIL: 4a un ajeno vio % observaciones', n; end if;
    raise notice 'PASS: 4a un ajeno no ve nada';

    update observaciones set descartada_at = now() where id = 'dddddddd-0000-0000-0000-000000000031';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 4b un ajeno pudo descartar'; end if;
    delete from observaciones where id = 'dddddddd-0000-0000-0000-000000000031';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: 4c un ajeno pudo borrar'; end if;
    raise notice 'PASS: 4b/4c un ajeno no descarta ni borra';
  end $$;

  -- anon no tiene acceso a la tabla.
  reset role;
  set local role anon;
  do $$
  begin
    begin
      perform 1 from observaciones limit 1;
      raise exception 'FAIL: 4d anon pudo leer';
    exception when insufficient_privilege then
      raise notice 'PASS: 4d anon no lee';
    end;
  end $$;

rollback;

-- ===========================================================================
-- 5 — Restricciones de la tabla (como postgres): dedupe, tipo, severidad, href, cascada y la preferencia nueva
-- ===========================================================================
begin;

  insert into observaciones (usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta)
  values (:owner_id, 'presion_alta', 'atencion', 'test:unica', 't', 't', now() + interval '1 day');

  select set_config('app.o', (:owner_id)::text, true);

  do $$
  declare
    o uuid := current_setting('app.o')::uuid;
    n int;
    v text;
  begin
    begin
      insert into observaciones (usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta)
      values (o, 'presion_alta', 'atencion', 'test:unica', 't', 't', now() + interval '1 day');
      raise exception 'FAIL: 5a se pudo duplicar (usuario_id, clave)';
    exception when unique_violation then
      raise notice 'PASS: 5a unique (usuario_id, clave)';
    end;

    begin
      insert into observaciones (usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta)
      values (o, 'inventado', 'atencion', 'test:tipo', 't', 't', now() + interval '1 day');
      raise exception 'FAIL: 5b aceptó un tipo inválido';
    exception when check_violation then
      raise notice 'PASS: 5b el tipo está acotado a los 9 valores';
    end;

    begin
      insert into observaciones (usuario_id, tipo, severidad, clave, titulo, texto, vigente_hasta)
      values (o, 'presion_alta', 'grave', 'test:sev', 't', 't', now() + interval '1 day');
      raise exception 'FAIL: 5c aceptó una severidad inválida';
    exception when check_violation then
      raise notice 'PASS: 5c severidad solo info o atencion';
    end;

    begin
      insert into observaciones (usuario_id, tipo, severidad, clave, titulo, texto, href, vigente_hasta)
      values (o, 'presion_alta', 'info', 'test:href', 't', 't', 'https://malo.example', now() + interval '1 day');
      raise exception 'FAIL: 5d aceptó un href externo';
    exception when check_violation then
      raise notice 'PASS: 5d href solo rutas internas /app';
    end;

    select confdeltype::text into v
    from pg_constraint
    where conrelid = 'observaciones'::regclass and contype = 'f';
    if v <> 'c' then raise exception 'FAIL: 5e la FK a auth.users no es ON DELETE CASCADE (%)', v; end if;
    raise notice 'PASS: 5e cascada al borrar el usuario';

    select count(*) into n
    from information_schema.columns
    where table_name = 'preferencias_avisos' and column_name = 'observaciones' and column_default = 'true';
    if n <> 1 then raise exception 'FAIL: 5f preferencias_avisos.observaciones no existe con default true'; end if;
    raise notice 'PASS: 5f el interruptor "Observaciones de vita" arranca prendido';
  end $$;

rollback;
