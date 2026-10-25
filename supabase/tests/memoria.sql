-- Memoria — tests for migration 035 (memorias, resumen_conversacion, tareas_memoria, mensajes_chat).
--
-- Hand-written psql script, same style as familia.sql: each section is its own transaction that
-- ROLLBACKs, so no fixture rows remain. A clean run prints one `NOTICE: PASS: ...` per assertion.
-- NOT RUN when written (no database available in the authoring session): run it after applying 035.
--
-- Prerequisites:
--   1. Migrations up to 035 applied.
--   2. Three REAL existing accounts (auth.users): user_a (A, owner), user_b (B, unrelated) and
--      cuidador_id (C, who gets an accepted caregiver link to A inside the test).
--   3. Connect as the `postgres` pooler role (bypasses RLS for fixtures).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v user_a="'<uuid>'" -v user_b="'<uuid>'" -v cuidador_id="'<uuid>'" \
--     -f supabase/tests/memoria.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — Owner sees own memories/summary; another user sees nothing and cannot write as A
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto)
  values ('dddddddd-0000-0000-0000-000000000001', :user_a, 'yo', 'test_clave', 'Recuerdo de prueba');
  insert into resumen_conversacion (usuario_id, resumen) values (:user_a, 'Resumen de prueba')
  on conflict (usuario_id) do update set resumen = excluded.resumen;

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from memorias where id = 'dddddddd-0000-0000-0000-000000000001';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su recuerdo'; end if;
    select count(*) into n from resumen_conversacion where usuario_id = current_setting('app.a')::uuid;
    if n <> 1 then raise exception 'FAIL: el dueño no ve su resumen'; end if;
    raise notice 'PASS: el dueño ve su memoria y su resumen';
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from memorias where id = 'dddddddd-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'FAIL: otro usuario ve un recuerdo ajeno'; end if;
    select count(*) into n from resumen_conversacion where usuario_id = current_setting('app.a')::uuid;
    if n <> 0 then raise exception 'FAIL: otro usuario ve un resumen ajeno'; end if;
    raise notice 'PASS: otro usuario no ve nada';

    update memorias set texto = 'pisado' where id = 'dddddddd-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario actualizó un recuerdo ajeno'; end if;
    delete from memorias where id = 'dddddddd-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario borró un recuerdo ajeno'; end if;
    raise notice 'PASS: update y delete ajenos no tocan filas';

    begin
      insert into memorias (usuario_id, sobre_tipo, clave, texto) values (current_setting('app.a')::uuid, 'yo', 'k', 'x');
      raise exception 'FAIL: otro usuario insertó a nombre ajeno';
    exception when insufficient_privilege then
      raise notice 'PASS: insert a nombre ajeno rechazado por RLS';
    end;
  end $$;
rollback;

-- ===========================================================================
-- 2 — A caregiver of A (any rol) sees nothing of A's memory
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  delete from vinculos_cuidador where elder_id = :user_a and cuidador_id = :cuidador_id;
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-0000000000c1', :user_a, :cuidador_id, '', 'aceptado', now(), 'editar');
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto)
  values ('dddddddd-0000-0000-0000-000000000002', :user_a, 'yo', 'test_cuidador', 'Privado');
  insert into resumen_conversacion (usuario_id, resumen) values (:user_a, 'Privado')
  on conflict (usuario_id) do update set resumen = excluded.resumen;

  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from memorias where usuario_id = current_setting('app.a')::uuid;
    if n <> 0 then raise exception 'FAIL: el cuidador ve recuerdos de la persona cuidada'; end if;
    select count(*) into n from resumen_conversacion where usuario_id = current_setting('app.a')::uuid;
    if n <> 0 then raise exception 'FAIL: el cuidador ve el resumen de la persona cuidada'; end if;
    raise notice 'PASS: el cuidador no ve memorias ni resumen';
  end $$;
rollback;

-- ===========================================================================
-- 3 — One vigente per (owner, about whom, key); replaced/borrado do not collide
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  insert into memorias (usuario_id, sobre_tipo, sobre_nombre, clave, texto)
  values (:user_a, 'familiar', 'Laura', 'dia_visita', 'Viene los martes');
  do $$
  begin
    begin
      insert into memorias (usuario_id, sobre_tipo, sobre_nombre, clave, texto)
      values (current_setting('app.a')::uuid, 'familiar', 'laura', 'dia_visita', 'Viene los jueves');
      raise exception 'FAIL: dos vigentes con la misma clave y persona';
    exception when unique_violation then
      raise notice 'PASS: un solo vigente por persona y clave (el nombre no distingue mayúsculas)';
    end;
  end $$;
  -- Otra clave, y la misma clave sobre otra persona, sí pueden convivir.
  insert into memorias (usuario_id, sobre_tipo, sobre_nombre, clave, texto)
  values (:user_a, 'familiar', 'Laura', 'otra_clave', 'Otra cosa'), (:user_a, 'yo', null, 'dia_visita', 'Mío');
  -- Reemplazar libera la clave.
  update memorias set estado = 'reemplazado' where usuario_id = :user_a and sobre_nombre = 'Laura' and clave = 'dia_visita';
  insert into memorias (usuario_id, sobre_tipo, sobre_nombre, clave, texto)
  values (:user_a, 'familiar', 'Laura', 'dia_visita', 'Viene los jueves');
  do $$ begin raise notice 'PASS: reemplazar libera la clave para un nuevo vigente'; end $$;
rollback;

-- ===========================================================================
-- 4 — A deleted memory keeps no text; the rest of the checks
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto)
  values ('dddddddd-0000-0000-0000-000000000004', :user_a, 'yo', 'a_borrar', 'Texto sensible');
  do $$
  begin
    begin
      update memorias set estado = 'borrado' where id = 'dddddddd-0000-0000-0000-000000000004';
      raise exception 'FAIL: un recuerdo borrado conservó el texto';
    exception when check_violation then
      raise notice 'PASS: borrado con texto rechazado';
    end;
  end $$;
  update memorias set estado = 'borrado', texto = null where id = 'dddddddd-0000-0000-0000-000000000004';
  do $$
  begin
    begin
      insert into memorias (usuario_id, sobre_tipo, clave, texto, tipo)
      values (current_setting('app.a')::uuid, 'yo', 'pasajero_sin_vencer', 'Hoy estoy triste', 'pasajero');
      raise exception 'FAIL: un pasajero sin vencimiento';
    exception when check_violation then
      raise notice 'PASS: un pasajero exige vencimiento';
    end;
  end $$;
rollback;

-- ===========================================================================
-- 5 — tareas_memoria: no policies for users; one pending per (user, tipo)
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  insert into tareas_memoria (usuario_id, tipo) values (:user_a, 'resumir');
  do $$
  begin
    begin
      insert into tareas_memoria (usuario_id, tipo) values (current_setting('app.a')::uuid, 'resumir');
      raise exception 'FAIL: dos tareas pendientes del mismo tipo';
    exception when unique_violation then
      raise notice 'PASS: una sola tarea pendiente por persona y tipo';
    end;
  end $$;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from tareas_memoria;
    if n <> 0 then raise exception 'FAIL: un usuario ve la cola'; end if;
    raise notice 'PASS: tareas_memoria sin acceso para usuarios (RLS sin policies)';
  end $$;
rollback;
