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
