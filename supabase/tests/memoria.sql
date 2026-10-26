-- Memoria — tests for migration 035 (memorias, resumen_conversacion, tareas_memoria, mensajes_chat)
-- and, from section 6 on, for 038 (olvidar_memoria, olvidar_todo_memoria, borrar_mensajes_hasta, guardar_resumen_regenerado).
--
-- Hand-written psql script, same style as familia.sql: each section is its own transaction that
-- ROLLBACKs, so no fixture rows remain. A clean run prints one `NOTICE: PASS: ...` per assertion.
-- NOT RUN when written (no database available in the authoring session): run it after applying 035 (sections 1-5)
-- and 038 (sections 6-10; they also need 036/037 applied, 038 depends on them). Sections 6-10 use fixed uuids
-- (dddddddd-...-00a*, eeeeeeee-...-00b*, ffffffff-...-00c*) and only touch user_a rows inside rolled-back transactions.
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

-- ===========================================================================
-- 6 — olvidar_memoria (dejar de recordar): chain + turn expansion, messages excluded not deleted
-- ===========================================================================
begin;
  -- Fixtures (as postgres): turn 1 = m1 (user) + m2 (assistant), turn 2 = m3, unrelated m4.
  -- a1 (reemplazado, from m3) <- a2 (vigente, corrige a1, from m1); a3 (vigente, other key, from m1).
  insert into mensajes_chat (id, usuario_id, role, contenido, pedido_id, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'user', 'Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'assistant', 'Anotado, Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'user', 'Laura venía los martes', 'ffffffff-0000-0000-0000-0000000000c2', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'user', 'Hola, qué tal', 'ffffffff-0000-0000-0000-0000000000c3', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  insert into resumen_conversacion (usuario_id, resumen, version, invalidado) values (:user_a, 'Laura viene los jueves', 3, false)
  on conflict (usuario_id) do update set resumen = excluded.resumen, version = 3, invalidado = false,
    cubre_hasta_mensaje_id = null, cubre_hasta_created_at = null;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int; v text; ver int; inv boolean;
  begin
    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a2', '{}', false);
    if r.o_recuerdos <> 2 then raise exception 'FAIL: dejar de recordar debía borrar el recuerdo y su versión anterior (%)', r.o_recuerdos; end if;
    select count(*) into n from memorias where id in ('dddddddd-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a2') and estado = 'borrado' and texto is null;
    if n <> 2 then raise exception 'FAIL: la cadena no quedó borrada sin texto'; end if;
    select estado into v from memorias where id = 'dddddddd-0000-0000-0000-0000000000a3';
    if v <> 'vigente' then raise exception 'FAIL: dejar de recordar tocó otro recuerdo'; end if;
    raise notice 'PASS: dejar de recordar borra el recuerdo y sus versiones anteriores sin texto';
    select count(*) into n from mensajes_chat where id in ('eeeeeeee-0000-0000-0000-0000000000b1','eeeeeeee-0000-0000-0000-0000000000b2','eeeeeeee-0000-0000-0000-0000000000b3') and excluido_memoria;
    if n <> 3 then raise exception 'FAIL: faltan mensajes excluidos (origen, resto del turno y origen de la versión anterior): %', n; end if;
    select count(*) into n from mensajes_chat where id = 'eeeeeeee-0000-0000-0000-0000000000b4' and not excluido_memoria;
    if n <> 1 then raise exception 'FAIL: se excluyó un mensaje ajeno al recuerdo'; end if;
    select count(*) into n from mensajes_chat where id like 'eeeeeeee-0000-0000-0000-0000000000b%';
    if n <> 4 then raise exception 'FAIL: dejar de recordar borró mensajes'; end if;
    raise notice 'PASS: dejar de recordar excluye los mensajes de origen y del turno, sin borrarlos';
    select resumen, version, invalidado into v, ver, inv from resumen_conversacion where usuario_id = auth.uid();
    if v <> '' or ver <> 4 or not inv then raise exception 'FAIL: el resumen no quedó invalidado (% / % / %)', v, ver, inv; end if;
    raise notice 'PASS: el resumen queda vacío, invalidado y con la versión +1';
  end $$;
rollback;

-- ===========================================================================
-- 7 — olvidar_memoria (eliminar): messages deleted, derived memories borrado, other user cannot reach it
-- ===========================================================================
begin;
  -- Fixtures (as postgres): turn 1 = m1 (user) + m2 (assistant), turn 2 = m3, unrelated m4.
  -- a1 (reemplazado, from m3) <- a2 (vigente, corrige a1, from m1); a3 (vigente, other key, from m1).
  insert into mensajes_chat (id, usuario_id, role, contenido, pedido_id, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'user', 'Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'assistant', 'Anotado, Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'user', 'Laura venía los martes', 'ffffffff-0000-0000-0000-0000000000c2', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'user', 'Hola, qué tal', 'ffffffff-0000-0000-0000-0000000000c3', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  insert into resumen_conversacion (usuario_id, resumen, version, invalidado) values (:user_a, 'Laura viene los jueves', 3, false)
  on conflict (usuario_id) do update set resumen = excluded.resumen, version = 3, invalidado = false,
    cubre_hasta_mensaje_id = null, cubre_hasta_created_at = null;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int; v text;
  begin
    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a2', '{}', true);
    select count(*) into n from mensajes_chat where id in ('eeeeeeee-0000-0000-0000-0000000000b1','eeeeeeee-0000-0000-0000-0000000000b2','eeeeeeee-0000-0000-0000-0000000000b3');
    if n <> 0 then raise exception 'FAIL: eliminar no borró los mensajes de origen y del turno (quedan %)', n; end if;
    select count(*) into n from mensajes_chat where id = 'eeeeeeee-0000-0000-0000-0000000000b4';
    if n <> 1 then raise exception 'FAIL: eliminar borró un mensaje ajeno'; end if;
    raise notice 'PASS: eliminar borra los mensajes de origen y su turno';
    select count(*) into n from memorias where id in ('dddddddd-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a2','dddddddd-0000-0000-0000-0000000000a3') and estado = 'borrado' and texto is null;
    if n <> 3 then raise exception 'FAIL: eliminar debía borrar también el recuerdo derivado del mismo mensaje (%)', n; end if;
    raise notice 'PASS: eliminar deja borrado sin texto lo que salió de los mensajes';
    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a2', '{}', true);
    if r.o_recuerdos <> 0 then raise exception 'FAIL: repetir debía ser un no-op'; end if;
    raise notice 'PASS: repetir sobre un recuerdo ya borrado no hace nada';
  end $$;
  reset role;
  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int;
  begin
    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a3', array['eeeeeeee-0000-0000-0000-0000000000b4']::uuid[], true);
    if r.o_recuerdos <> 0 or r.o_mensajes <> 0 then raise exception 'FAIL: otro usuario alcanzó datos ajenos'; end if;
    raise notice 'PASS: otro usuario no puede olvidar recuerdos ni mensajes ajenos';
  end $$;
rollback;

-- ===========================================================================
-- 8 — olvidar_todo_memoria: all memories borrado, messages intact, empty summary with cut at the last message
-- ===========================================================================
begin;
  -- Fixtures (as postgres): turn 1 = m1 (user) + m2 (assistant), turn 2 = m3, unrelated m4.
  -- a1 (reemplazado, from m3) <- a2 (vigente, corrige a1, from m1); a3 (vigente, other key, from m1).
  insert into mensajes_chat (id, usuario_id, role, contenido, pedido_id, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'user', 'Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'assistant', 'Anotado, Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'user', 'Laura venía los martes', 'ffffffff-0000-0000-0000-0000000000c2', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'user', 'Hola, qué tal', 'ffffffff-0000-0000-0000-0000000000c3', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  insert into resumen_conversacion (usuario_id, resumen, version, invalidado) values (:user_a, 'Laura viene los jueves', 3, false)
  on conflict (usuario_id) do update set resumen = excluded.resumen, version = 3, invalidado = false,
    cubre_hasta_mensaje_id = null, cubre_hasta_created_at = null;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int; v text; ver int; inv boolean; corte uuid;
  begin
    select * into r from olvidar_todo_memoria();
    if r.o_recuerdos <> 3 then raise exception 'FAIL: borrar todo debía alcanzar 3 recuerdos (%)', r.o_recuerdos; end if;
    select count(*) into n from memorias where usuario_id = auth.uid() and (estado <> 'borrado' or texto is not null);
    if n <> 0 then raise exception 'FAIL: quedó algún recuerdo con texto'; end if;
    raise notice 'PASS: borrar todo deja todos los recuerdos borrados sin texto';
    select count(*) into n from mensajes_chat where id like 'eeeeeeee-0000-0000-0000-0000000000b%' and not excluido_memoria;
    if n <> 4 then raise exception 'FAIL: borrar todo tocó los mensajes'; end if;
    raise notice 'PASS: borrar todo no toca los mensajes';
    select resumen, version, invalidado, cubre_hasta_mensaje_id into v, ver, inv, corte from resumen_conversacion where usuario_id = auth.uid();
    if v <> '' or ver <> 4 or inv then raise exception 'FAIL: resumen esperado vacío/vigente/versión 4 (% / % / %)', v, ver, inv; end if;
    if corte is distinct from (select id from mensajes_chat where usuario_id = auth.uid() order by created_at desc, id desc limit 1) then
      raise exception 'FAIL: el corte no quedó en el último mensaje';
    end if;
    raise notice 'PASS: el resumen queda en blanco, con la versión +1 y el corte en el último mensaje';
  end $$;
rollback;

-- ===========================================================================
-- 9 — borrar_mensajes_hasta: 0 deletions leaves the summary alone, >0 invalidates it and removes derived memories
-- ===========================================================================
begin;
  -- Fixtures (as postgres): turn 1 = m1 (user) + m2 (assistant), turn 2 = m3, unrelated m4.
  -- a1 (reemplazado, from m3) <- a2 (vigente, corrige a1, from m1); a3 (vigente, other key, from m1).
  insert into mensajes_chat (id, usuario_id, role, contenido, pedido_id, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'user', 'Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'assistant', 'Anotado, Laura viene los jueves', 'ffffffff-0000-0000-0000-0000000000c1', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'user', 'Laura venía los martes', 'ffffffff-0000-0000-0000-0000000000c2', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'user', 'Hola, qué tal', 'ffffffff-0000-0000-0000-0000000000c3', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  insert into resumen_conversacion (usuario_id, resumen, version, invalidado) values (:user_a, 'Laura viene los jueves', 3, false)
  on conflict (usuario_id) do update set resumen = excluded.resumen, version = 3, invalidado = false,
    cubre_hasta_mensaje_id = null, cubre_hasta_created_at = null;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; v text; ver int; inv boolean; n int;
  begin
    select * into r from borrar_mensajes_hasta(now() - interval '30 days');
    if r.o_mensajes <> 0 or r.o_recuerdos <> 0 then raise exception 'FAIL: un corte sin mensajes no debía borrar nada'; end if;
    select resumen, version, invalidado into v, ver, inv from resumen_conversacion where usuario_id = auth.uid();
    if v <> 'Laura viene los jueves' or ver <> 3 or inv then raise exception 'FAIL: con 0 borrados el resumen no debía tocarse (% / % / %)', v, ver, inv; end if;
    raise notice 'PASS: con 0 mensajes borrados no se invalida el resumen';

    select * into r from borrar_mensajes_hasta(now() - interval '2 hours');
    if r.o_mensajes <> 3 then raise exception 'FAIL: debían borrarse 3 mensajes (%)', r.o_mensajes; end if;
    select count(*) into n from memorias where usuario_id = auth.uid() and mensaje_origen_id in ('eeeeeeee-0000-0000-0000-0000000000b1','eeeeeeee-0000-0000-0000-0000000000b3') and (estado <> 'borrado' or texto is not null);
    if n <> 0 then raise exception 'FAIL: quedaron recuerdos derivados de mensajes borrados'; end if;
    select resumen, version, invalidado into v, ver, inv from resumen_conversacion where usuario_id = auth.uid();
    if v <> '' or ver <> 4 or not inv then raise exception 'FAIL: con >0 borrados el resumen debía invalidarse (% / % / %)', v, ver, inv; end if;
    raise notice 'PASS: con mensajes borrados se borran los recuerdos derivados y se invalida el resumen';
  end $$;
rollback;

-- ===========================================================================
-- 10 — guardar_resumen_regenerado: version race and only while invalidated (runs as postgres = service_role)
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
  insert into resumen_conversacion (usuario_id, resumen, version, invalidado) values (:user_a, '', 5, true)
  on conflict (usuario_id) do update set resumen = '', version = 5, invalidado = true;
  do $$
  declare r record; ver int; inv boolean; txt text;
  begin
    select * into r from guardar_resumen_regenerado(current_setting('app.a')::uuid, 'nuevo', '[]'::jsonb, 4);
    if r.o_guardado then raise exception 'FAIL: guardó con una versión vieja'; end if;
    raise notice 'PASS: una versión vieja se descarta';
    select * into r from guardar_resumen_regenerado(current_setting('app.a')::uuid, 'nuevo', '["algo"]'::jsonb, 5);
    select resumen, version, invalidado into txt, ver, inv from resumen_conversacion where usuario_id = current_setting('app.a')::uuid;
    if not r.o_guardado or txt <> 'nuevo' or ver <> 6 or inv then raise exception 'FAIL: no guardó con la versión esperada'; end if;
    raise notice 'PASS: con la versión esperada guarda, sube la versión y levanta la invalidación';
    select * into r from guardar_resumen_regenerado(current_setting('app.a')::uuid, 'otro', '[]'::jsonb, 6);
    if r.o_guardado then raise exception 'FAIL: regeneró un resumen que no estaba invalidado'; end if;
    raise notice 'PASS: no pisa un resumen vigente';
  end $$;
rollback;

-- ===========================================================================
-- 039 sections (11-16): marcar_pasajeros_vencidos, aplicar_consolidacion (idempotency, stale snapshot skip),
-- cascade trigger, resolver_contradiccion. NOT RUN when written (no database/psql in the authoring session): run after
-- applying 035-039. Fixtures use fixed uuids 99999999-0000-0000-0000-0000000000XX and 88888888-... (lotes); each section
-- ROLLBACKs. Sections 11-14 run as postgres (service_role equivalent); section 15-16 simulate the authenticated owner.
-- ===========================================================================

-- ===========================================================================
-- 11 — marcar_pasajeros_vencidos: only expired pasajeros, text removed, estables untouched, idempotent
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo, vence_at) values
    ('99999999-0000-0000-0000-000000000011', :user_a, 'yo', 'animo_viejo', 'Hoy estoy triste', 'pasajero', now() - interval '1 hour'),
    ('99999999-0000-0000-0000-000000000012', :user_a, 'yo', 'animo_nuevo', 'Me duele la cabeza', 'pasajero', now() + interval '1 day');
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo) values
    ('99999999-0000-0000-0000-000000000013', :user_a, 'yo', 'gusto', 'Le gusta el mate', 'estable');
  do $$
  declare n int; e text; t text;
  begin
    n := marcar_pasajeros_vencidos();
    if n < 1 then raise exception 'FAIL: debía archivar al menos el pasajero vencido (%)', n; end if;
    select estado, texto into e, t from memorias where id = '99999999-0000-0000-0000-000000000011';
    if e <> 'vencido' or t is not null then raise exception 'FAIL: el vencido debía quedar sin texto (% / %)', e, t; end if;
    raise notice 'PASS: el pasajero vencido pasa a vencido sin texto';
    select estado into e from memorias where id = '99999999-0000-0000-0000-000000000012';
    if e <> 'vigente' then raise exception 'FAIL: tocó un pasajero que no venció'; end if;
    select estado into e from memorias where id = '99999999-0000-0000-0000-000000000013';
    if e <> 'vigente' then raise exception 'FAIL: tocó un estable'; end if;
    raise notice 'PASS: no toca pasajeros vigentes ni estables';
    n := marcar_pasajeros_vencidos();
    if exists (select 1 from memorias where id = '99999999-0000-0000-0000-000000000011' and estado <> 'vencido') then raise exception 'FAIL: no idempotente'; end if;
    raise notice 'PASS: repetir no cambia nada';
  end $$;
rollback;

-- ===========================================================================
-- 12 — aplicar_consolidacion: merge + highlight, same-person guard, idempotency (second call = ya_aplicado)
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo, usos) values
    ('99999999-0000-0000-0000-000000000021', :user_a, 'yo', 'toma_enalapril', 'Toma enalapril a la mañana', 'estable', 2),
    ('99999999-0000-0000-0000-000000000022', :user_a, 'yo', 'enalapril', 'Toma el enalapril a la mañana', 'estable', 1),
    ('99999999-0000-0000-0000-000000000023', :user_a, 'yo', 'camina', 'Camina todas las tardes', 'estable', 0);
  insert into lotes_consolidacion (id) values ('88888888-0000-0000-0000-000000000001');
  insert into lote_usuarios (lote_id, usuario_id, custom_id, snapshot) values
    ('88888888-0000-0000-0000-000000000001', :user_a, 'u_test_a', '[]'::jsonb);
  do $$
  declare
    a uuid := current_setting('app.a')::uuid;
    snap jsonb;
    plan jsonb;
    r record; n int; nuevo uuid; est text; rp uuid; dest boolean; ult text;
  begin
    select jsonb_object_agg(id::text, updated_at) into snap from memorias where usuario_id = a;
    plan := jsonb_build_object(
      'unir', jsonb_build_array(jsonb_build_object('ids', jsonb_build_array('99999999-0000-0000-0000-000000000021','99999999-0000-0000-0000-000000000022'), 'texto', 'Toma enalapril a la mañana', 'clave', 'enalapril_manana')),
      'destacados', jsonb_build_array('99999999-0000-0000-0000-000000000023'),
      'contradicciones', '[]'::jsonb);
    select * into r from aplicar_consolidacion('88888888-0000-0000-0000-000000000001', a, plan, snap, 8, 1000);
    if r.o_estado <> 'aplicado' or r.o_unidos <> 1 or r.o_destacados <> 1 then raise exception 'FAIL: resultado inesperado (% / % / %)', r.o_estado, r.o_unidos, r.o_destacados; end if;
    select id into nuevo from memorias where usuario_id = a and estado = 'vigente' and origen = 'consolidacion';
    if nuevo is null then raise exception 'FAIL: no nació el recuerdo unido'; end if;
    select estado, reemplazada_por_id into est, rp from memorias where id = '99999999-0000-0000-0000-000000000021';
    if est <> 'reemplazado' or rp <> nuevo then raise exception 'FAIL: el viejo debía quedar reemplazado apuntando al unido (% / %)', est, rp; end if;
    select destacado into dest from memorias where id = '99999999-0000-0000-0000-000000000023';
    if not dest then raise exception 'FAIL: no destacó el recuerdo elegido'; end if;
    raise notice 'PASS: une duplicados y destaca';

    select * into r from aplicar_consolidacion('88888888-0000-0000-0000-000000000001', a, plan, snap, 8, 1000);
    if r.o_estado <> 'ya_aplicado' then raise exception 'FAIL: el segundo intento debía ser ya_aplicado (%)', r.o_estado; end if;
    select count(*) into n from memorias where usuario_id = a and origen = 'consolidacion';
    if n <> 1 then raise exception 'FAIL: el segundo intento creó otro unido (%)', n; end if;
    raise notice 'PASS: aplicar dos veces es idempotente';
  end $$;
rollback;

-- ===========================================================================
-- 13 — aplicar_consolidacion: stale plans are skipped (changed, deleted, other person), nothing is revived
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo) values
    ('99999999-0000-0000-0000-000000000031', :user_a, 'yo', 'k1', 'Dato uno', 'estable'),
    ('99999999-0000-0000-0000-000000000032', :user_a, 'yo', 'k2', 'Dato uno bis', 'estable'),
    ('99999999-0000-0000-0000-000000000033', :user_a, 'yo', 'k3', 'Dato tres', 'estable'),
    ('99999999-0000-0000-0000-000000000034', :user_a, 'yo', 'k4', 'Dato cuatro', 'estable');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, tipo) values
    ('99999999-0000-0000-0000-000000000035', :user_a, 'otro', 'Laura', 'k5', 'Laura trabaja de tarde', 'estable');
  insert into lotes_consolidacion (id) values ('88888888-0000-0000-0000-000000000002');
  insert into lote_usuarios (lote_id, usuario_id, custom_id, snapshot) values ('88888888-0000-0000-0000-000000000002', :user_a, 'u_test_b', '[]'::jsonb);
  do $$
  declare
    a uuid := current_setting('app.a')::uuid;
    snap jsonb; plan jsonb; r record; est text; txt text;
  begin
    select jsonb_object_agg(id::text, updated_at) into snap from memorias where usuario_id = a;
    -- Mientras corría el lote: 31 cambió (corregido), 33 se borró, 34 intacto.
    update memorias set texto = 'Dato uno corregido', updated_at = now() + interval '1 second' where id = '99999999-0000-0000-0000-000000000031';
    update memorias set estado = 'borrado', texto = null where id = '99999999-0000-0000-0000-000000000033';
    plan := jsonb_build_object(
      'unir', jsonb_build_array(
        jsonb_build_object('ids', jsonb_build_array('99999999-0000-0000-0000-000000000031','99999999-0000-0000-0000-000000000032'), 'texto', 'Dato uno', 'clave', 'uno'),
        jsonb_build_object('ids', jsonb_build_array('99999999-0000-0000-0000-000000000033','99999999-0000-0000-0000-000000000034'), 'texto', 'Dato tres y cuatro', 'clave', 'tres_cuatro'),
        jsonb_build_object('ids', jsonb_build_array('99999999-0000-0000-0000-000000000034','99999999-0000-0000-0000-000000000035'), 'texto', 'mezcla de personas', 'clave', 'mezcla')),
      'destacados', jsonb_build_array('99999999-0000-0000-0000-000000000033'),
      'contradicciones', jsonb_build_array(jsonb_build_object('a','99999999-0000-0000-0000-000000000031','b','99999999-0000-0000-0000-000000000034','pregunta','¿Cuál vale?')));
    select * into r from aplicar_consolidacion('88888888-0000-0000-0000-000000000002', a, plan, snap, 8, 1000);
    if r.o_unidos <> 0 or r.o_destacados <> 0 or r.o_contradicciones <> 0 or r.o_omitidos < 4 then
      raise exception 'FAIL: debía saltear todo (unidos % destacados % contradicciones % omitidos %)', r.o_unidos, r.o_destacados, r.o_contradicciones, r.o_omitidos;
    end if;
    raise notice 'PASS: un plan viejo (cambiado, borrado o de otra persona) se saltea ítem por ítem';
    select estado, texto into est, txt from memorias where id = '99999999-0000-0000-0000-000000000033';
    if est <> 'borrado' or txt is not null then raise exception 'FAIL: un recuerdo borrado revivió o recuperó texto'; end if;
    select estado into est from memorias where id = '99999999-0000-0000-0000-000000000031';
    if est <> 'vigente' then raise exception 'FAIL: el recuerdo cambiado no debía tocarse'; end if;
    if exists (select 1 from memorias where usuario_id = a and origen = 'consolidacion') then raise exception 'FAIL: se creó un unido a pesar del plan viejo'; end if;
    raise notice 'PASS: lo borrado no revive y lo cambiado no se pisa';
  end $$;
rollback;

-- ===========================================================================
-- 14 — cascade trigger: forgetting an ingredient forgets the merged memory and the other ingredients; closes contradictions
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo, origen) values
    ('99999999-0000-0000-0000-000000000041', :user_a, 'yo', 'unido', 'Toma enalapril', 'estable', 'consolidacion'),
    ('99999999-0000-0000-0000-000000000044', :user_a, 'yo', 'otra', 'Otra cosa', 'estable', 'chat');
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo, estado, reemplazada_por_id) values
    ('99999999-0000-0000-0000-000000000042', :user_a, 'yo', 'ing1', 'Toma enalapril 1', 'estable', 'reemplazado', '99999999-0000-0000-0000-000000000041'),
    ('99999999-0000-0000-0000-000000000043', :user_a, 'yo', 'ing2', 'Toma enalapril 2', 'estable', 'reemplazado', '99999999-0000-0000-0000-000000000041');
  insert into contradicciones_memoria (id, usuario_id, memoria_a, memoria_b, pregunta) values
    ('77777777-0000-0000-0000-000000000041', :user_a, '99999999-0000-0000-0000-000000000041', '99999999-0000-0000-0000-000000000044', '¿Cuál vale?');
  do $$
  declare n int; est text; pr text;
  begin
    update memorias set estado = 'borrado', texto = null where id = '99999999-0000-0000-0000-000000000042';
    select count(*) into n from memorias where id in ('99999999-0000-0000-0000-000000000041','99999999-0000-0000-0000-000000000043') and estado = 'borrado' and texto is null;
    if n <> 2 then raise exception 'FAIL: borrar un ingrediente debía arrastrar al unido y al otro ingrediente (%)', n; end if;
    raise notice 'PASS: la cascada borra el unido y sus ingredientes';
    select estado, pregunta into est, pr from contradicciones_memoria where id = '77777777-0000-0000-0000-000000000041';
    if est <> 'descartada' or pr <> '' then raise exception 'FAIL: la contradicción debía cerrarse y vaciarse (% / %)', est, pr; end if;
    raise notice 'PASS: una contradicción se descarta (sin pregunta) cuando uno de sus recuerdos deja de estar vigente';
    select estado into est from memorias where id = '99999999-0000-0000-0000-000000000044';
    if est <> 'vigente' then raise exception 'FAIL: la cascada tocó un recuerdo ajeno a la unión'; end if;
    raise notice 'PASS: no toca recuerdos que no son parte de la unión';
  end $$;
rollback;

-- ===========================================================================
-- 15 — resolver_contradiccion as the owner: a / ambas / ninguna; closed or foreign contradictions are not found
-- ===========================================================================
begin;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, tipo) values
    ('99999999-0000-0000-0000-000000000051', :user_a, 'yo', 'enalapril', 'Toma enalapril', 'estable'),
    ('99999999-0000-0000-0000-000000000052', :user_a, 'yo', 'enalapril_dejo', 'Dejó el enalapril', 'estable'),
    ('99999999-0000-0000-0000-000000000053', :user_a, 'yo', 'cafe', 'Toma café', 'estable'),
    ('99999999-0000-0000-0000-000000000054', :user_a, 'yo', 'cafe_no', 'No toma café', 'estable'),
    ('99999999-0000-0000-0000-000000000055', :user_a, 'yo', 'te', 'Toma té', 'estable'),
    ('99999999-0000-0000-0000-000000000056', :user_a, 'yo', 'te_no', 'No toma té', 'estable');
  insert into contradicciones_memoria (id, usuario_id, memoria_a, memoria_b, pregunta) values
    ('77777777-0000-0000-0000-000000000051', :user_a, '99999999-0000-0000-0000-000000000051', '99999999-0000-0000-0000-000000000052', '¿Sigue con el enalapril?'),
    ('77777777-0000-0000-0000-000000000052', :user_a, '99999999-0000-0000-0000-000000000053', '99999999-0000-0000-0000-000000000054', '¿Toma café?'),
    ('77777777-0000-0000-0000-000000000053', :user_a, '99999999-0000-0000-0000-000000000055', '99999999-0000-0000-0000-000000000056', '¿Toma té?');
  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record;
  begin
    select * into r from resolver_contradiccion('77777777-0000-0000-0000-000000000051', 'a');
    if r.o_resultado <> 'no_encontrada' then raise exception 'FAIL: otro usuario resolvió una contradicción ajena (%)', r.o_resultado; end if;
    raise notice 'PASS: otro usuario no encuentra la contradicción';
  end $$;
  reset role;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; est text; rp uuid; pr text; ce text;
  begin
    select * into r from resolver_contradiccion('77777777-0000-0000-0000-000000000051', 'a');
    select estado, reemplazada_por_id into est, rp from memorias where id = '99999999-0000-0000-0000-000000000052';
    select estado, pregunta into ce, pr from contradicciones_memoria where id = '77777777-0000-0000-0000-000000000051';
    if r.o_resultado <> 'ok' or est <> 'reemplazado' or rp <> '99999999-0000-0000-0000-000000000051' or ce <> 'resuelta' or pr <> '' then
      raise exception 'FAIL: vale a (% / % / % / %)', r.o_resultado, est, rp, ce;
    end if;
    raise notice 'PASS: vale a deja la otra como reemplazada y cierra la contradicción';
    select * into r from resolver_contradiccion('77777777-0000-0000-0000-000000000051', 'b');
    if r.o_resultado <> 'no_encontrada' then raise exception 'FAIL: una contradicción cerrada no se resuelve de nuevo'; end if;
    raise notice 'PASS: una contradicción cerrada no se vuelve a resolver';

    select * into r from resolver_contradiccion('77777777-0000-0000-0000-000000000052', 'ambas');
    if r.o_resultado <> 'ok' or exists (select 1 from memorias where id in ('99999999-0000-0000-0000-000000000053','99999999-0000-0000-0000-000000000054') and estado <> 'vigente') then
      raise exception 'FAIL: ambas debía dejar los dos vigentes';
    end if;
    raise notice 'PASS: ambas deja los dos recuerdos vigentes';

    select * into r from resolver_contradiccion('77777777-0000-0000-0000-000000000053', 'ninguna');
    if r.o_resultado <> 'ok' or exists (select 1 from memorias where id in ('99999999-0000-0000-0000-000000000055','99999999-0000-0000-0000-000000000056') and (estado <> 'borrado' or texto is not null)) then
      raise exception 'FAIL: ninguna debía olvidar los dos';
    end if;
    select estado into ce from contradicciones_memoria where id = '77777777-0000-0000-0000-000000000053';
    if ce <> 'resuelta' then raise exception 'FAIL: ninguna debía dejar la contradicción resuelta (%)', ce; end if;
    raise notice 'PASS: ninguna olvida los dos recuerdos y la contradicción queda resuelta';
  end $$;
rollback;

-- ===========================================================================
-- 16 — cierre de lotes: cerrar_lote_consolidacion is atomic; intento_fallido_lote_usuario caps retries (postgres)
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
  insert into lotes_consolidacion (id) values ('88888888-0000-0000-0000-000000000003');
  insert into lote_usuarios (lote_id, usuario_id, custom_id, snapshot) values ('88888888-0000-0000-0000-000000000003', :user_a, 'u_test_c', '[]'::jsonb);
  do $$
  declare a uuid := current_setting('app.a')::uuid; lote uuid := '88888888-0000-0000-0000-000000000003'; r text; cerrada boolean; est text; le text;
  begin
    r := cerrar_lote_consolidacion(lote, null);
    if r <> 'abierto' then raise exception 'FAIL: un lote con personas enviado no se cierra sin error (%)', r; end if;
    raise notice 'PASS: no se cierra un lote con personas sin resolver';
    cerrada := intento_fallido_lote_usuario(lote, a, 3, 'x'); cerrada := intento_fallido_lote_usuario(lote, a, 3, 'x');
    if cerrada then raise exception 'FAIL: cerró antes del tope'; end if;
    cerrada := intento_fallido_lote_usuario(lote, a, 3, 'reintentos_agotados');
    select estado into est from lote_usuarios where lote_id = lote and usuario_id = a;
    if not cerrada or est <> 'error' then raise exception 'FAIL: al tercer intento debía quedar en error (% / %)', cerrada, est; end if;
    raise notice 'PASS: el tope de intentos deja a la persona en error';
    r := cerrar_lote_consolidacion(lote, null);
    select estado into le from lotes_consolidacion where id = lote;
    if r <> 'fallido' or le <> 'fallido' then raise exception 'FAIL: sin aplicadas el lote debía quedar fallido (% / %)', r, le; end if;
    raise notice 'PASS: sin nadie enviado el lote se cierra (fallido si no se aplicó ninguno)';
  end $$;
rollback;
