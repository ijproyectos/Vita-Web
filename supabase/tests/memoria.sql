-- Memoria (fase 2) — tests de las migraciones 038, 039 y 040.
--   Secciones 1-4  -> 038 (tablas, RLS, restricciones).
--   Secciones 5-6  -> 039 (guardar / deshacer / buscar; buscar nunca devuelve mensajes excluidos).
--   Secciones 7-9  -> 040 (olvidar_memoria, olvidar_todo_memoria, borrar_recuerdos_de_sesiones_hasta).
--
-- Script de psql escrito a mano, mismo estilo que familia.sql: cada sección es su propia transacción y termina en
-- ROLLBACK, así que no quedan filas de prueba. Una corrida limpia imprime un `NOTICE: PASS: ...` por aserción.
-- NO SE CORRIÓ al escribirlo (no hay base de datos disponible en la sesión de autoría): correrlo después de aplicar las
-- migraciones. Usa uuids fijos (dddddddd-..., eeeeeeee-..., ffffffff-...) y solo toca filas de user_a dentro de
-- transacciones que se revierten.
--
-- Requisitos:
--   1. Migraciones hasta 040 aplicadas.
--   2. Tres cuentas REALES de auth.users: user_a (A, dueño), user_b (B, sin relación) y cuidador_id (C, que recibe un
--      vínculo aceptado con A dentro del test).
--   3. Conectarse como el rol `postgres` del pooler (saltea RLS para los fixtures).
--
-- Correr:
--   psql "<connection string>" \
--     -v user_a="'<uuid>'" -v user_b="'<uuid>'" -v cuidador_id="'<uuid>'" \
--     -f supabase/tests/memoria.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 (038) — El dueño ve su memoria; otro usuario no ve nada y no puede escribir a nombre ajeno
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto)
  values ('dddddddd-0000-0000-0000-000000000001', :user_a, 'yo', 'test_clave', 'Recuerdo de prueba');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from memorias where id = 'dddddddd-0000-0000-0000-000000000001';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su recuerdo'; end if;
    raise notice 'PASS: el dueño ve su memoria';
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from memorias where id = 'dddddddd-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'FAIL: otro usuario ve un recuerdo ajeno'; end if;
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
-- 2 (038) — Un cuidador de A (cualquier rol) no ve nada de la memoria de A
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.c', (:cuidador_id)::text, true);
  delete from vinculos_cuidador where elder_id = :user_a and cuidador_id = :cuidador_id;
  insert into vinculos_cuidador (id, elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
  values ('dddddddd-0000-0000-0000-0000000000c1', :user_a, :cuidador_id, '', 'aceptado', now(), 'editar');
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto)
  values ('dddddddd-0000-0000-0000-000000000002', :user_a, 'yo', 'test_cuidador', 'Privado');

  select set_config('request.jwt.claims', json_build_object('sub', :cuidador_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from memorias where usuario_id = current_setting('app.a')::uuid;
    if n <> 0 then raise exception 'FAIL: el cuidador ve recuerdos de la persona cuidada'; end if;
    raise notice 'PASS: el cuidador no ve memorias';
  end $$;
rollback;

-- ===========================================================================
-- 3 (038) — Un solo vigente por (dueño, sobre quién, clave); reemplazado y borrado no chocan
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
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
  insert into memorias (usuario_id, sobre_tipo, sobre_nombre, clave, texto)
  values (:user_a, 'familiar', 'Laura', 'otra_clave', 'Otra cosa'), (:user_a, 'yo', null, 'dia_visita', 'Mío');
  update memorias set estado = 'reemplazado' where usuario_id = :user_a and sobre_nombre = 'Laura' and clave = 'dia_visita';
  insert into memorias (usuario_id, sobre_tipo, sobre_nombre, clave, texto)
  values (:user_a, 'familiar', 'Laura', 'dia_visita', 'Viene los jueves');
  do $$ begin raise notice 'PASS: reemplazar libera la clave para un nuevo vigente'; end $$;
rollback;

-- ===========================================================================
-- 4 (038) — Un recuerdo borrado no conserva texto; un pasajero exige vencimiento
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true);
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
-- 5 (039) — guardar_memoria corrige en una transacción y deshacer_memoria restaura el anterior
-- ===========================================================================
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int; v text; id1 uuid; id2 uuid;
  begin
    select * into r from guardar_memoria('familiar', null, 'Laura', 'dia_visita', 'Laura viene los martes', 'estable', null, null, 'chat');
    id1 := r.o_id;
    if r.o_corrige_id is not null then raise exception 'FAIL: el primer guardado no corrige nada'; end if;
    select * into r from guardar_memoria('familiar', null, 'laura', 'dia_visita', 'Laura viene los jueves', 'estable', null, null, 'chat');
    id2 := r.o_id;
    if r.o_corrige_id is distinct from id1 or r.o_texto_anterior <> 'Laura viene los martes' then
      raise exception 'FAIL: el segundo guardado debía corregir al primero';
    end if;
    select estado into v from memorias where id = id1;
    if v <> 'reemplazado' then raise exception 'FAIL: el anterior debía quedar reemplazado (%)', v; end if;
    raise notice 'PASS: guardar con la misma clave corrige y reemplaza al anterior';

    select * into r from deshacer_memoria(id2);
    if not r.o_deshecho or r.o_restaurado_id is distinct from id1 then raise exception 'FAIL: deshacer no restauró el anterior'; end if;
    select count(*) into n from memorias where id = id2 and estado = 'borrado' and texto is null;
    if n <> 1 then raise exception 'FAIL: el deshecho debía quedar borrado sin texto'; end if;
    select estado into v from memorias where id = id1;
    if v <> 'vigente' then raise exception 'FAIL: el anterior debía volver a vigente (%)', v; end if;
    raise notice 'PASS: deshacer deja el nuevo borrado sin texto y restaura el anterior';
  end $$;
rollback;

-- ===========================================================================
-- 6 (039) — buscar_memoria encuentra mensajes y recuerdos, y NUNCA mensajes excluidos ni recuerdos borrados
-- ===========================================================================
begin;
  -- Fixtures (as postgres): sesion s1; turno 1 = m1 (user) + m2 (assistant), turno 2 = m3 (user) + m5 (assistant), m4 sin relación.
  -- a1 (reemplazado, de m3) <- a2 (vigente, corrige a1, de m1); a3 (vigente, otra clave, de m1).
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000c1', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura venía los martes', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b5', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura venía los martes', now() - interval '3 days' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura viene los jueves', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura viene los jueves', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Hola, qué tal', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from buscar_memoria('Laura jueves') b where b.o_fuente = 'mensaje';
    if n < 1 then raise exception 'FAIL: buscar_memoria no encontró el mensaje'; end if;
    select count(*) into n from buscar_memoria('Laura jueves') b where b.o_fuente = 'recuerdo';
    if n < 1 then raise exception 'FAIL: buscar_memoria no encontró el recuerdo'; end if;
    raise notice 'PASS: buscar_memoria encuentra mensajes y recuerdos';

    update mensajes_chat set excluido_memoria = true where id = 'eeeeeeee-0000-0000-0000-0000000000b1';
    select count(*) into n from buscar_memoria('Laura jueves') b where b.o_fuente = 'mensaje' and b.o_id = 'eeeeeeee-0000-0000-0000-0000000000b1';
    if n <> 0 then raise exception 'FAIL: buscar_memoria devolvió un mensaje excluido'; end if;
    raise notice 'PASS: buscar_memoria no devuelve mensajes excluidos';
  end $$;
rollback;

-- ===========================================================================
-- 7 (040) — olvidar_memoria: cadena de versiones + mensajes de origen y respuesta excluidos, sin borrarlos
-- ===========================================================================
begin;
  -- Fixtures (as postgres): sesion s1; turno 1 = m1 (user) + m2 (assistant), turno 2 = m3 (user) + m5 (assistant), m4 sin relación.
  -- a1 (reemplazado, de m3) <- a2 (vigente, corrige a1, de m1); a3 (vigente, otra clave, de m1).
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000c1', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura venía los martes', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b5', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura venía los martes', now() - interval '3 days' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura viene los jueves', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura viene los jueves', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Hola, qué tal', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int; v text;
  begin
    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a2');
    if r.o_recuerdos <> 2 then raise exception 'FAIL: debía borrar el recuerdo y su versión anterior (%)', r.o_recuerdos; end if;
    select count(*) into n from memorias where id in ('dddddddd-0000-0000-0000-0000000000a1','dddddddd-0000-0000-0000-0000000000a2') and estado = 'borrado' and texto is null;
    if n <> 2 then raise exception 'FAIL: la cadena no quedó borrada sin texto'; end if;
    select estado into v from memorias where id = 'dddddddd-0000-0000-0000-0000000000a3';
    if v <> 'vigente' then raise exception 'FAIL: tocó otro recuerdo'; end if;
    raise notice 'PASS: olvidar_memoria borra el recuerdo y sus versiones anteriores sin texto';

    select count(*) into n from mensajes_chat
     where id in ('eeeeeeee-0000-0000-0000-0000000000b1','eeeeeeee-0000-0000-0000-0000000000b2','eeeeeeee-0000-0000-0000-0000000000b3','eeeeeeee-0000-0000-0000-0000000000b5')
       and excluido_memoria;
    if n <> 4 then raise exception 'FAIL: faltan mensajes excluidos (orígenes y respuestas): %', n; end if;
    select count(*) into n from mensajes_chat where id = 'eeeeeeee-0000-0000-0000-0000000000b4' and not excluido_memoria;
    if n <> 1 then raise exception 'FAIL: se excluyó un mensaje ajeno al recuerdo'; end if;
    select count(*) into n from mensajes_chat where id like 'eeeeeeee-0000-0000-0000-0000000000b%';
    if n <> 5 then raise exception 'FAIL: olvidar_memoria borró mensajes'; end if;
    raise notice 'PASS: los mensajes de origen y sus respuestas quedan excluidos, sin borrarse';

    select count(*) into n from buscar_memoria('Laura jueves');
    if n <> 0 then raise exception 'FAIL: buscar_memoria todavía encuentra lo olvidado (%)', n; end if;
    raise notice 'PASS: buscar_memoria no encuentra lo olvidado';

    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a2');
    if r.o_recuerdos <> 0 then raise exception 'FAIL: repetir debía ser un no-op'; end if;
    raise notice 'PASS: repetir no hace nada';
  end $$;
  reset role;
  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record;
  begin
    select * into r from olvidar_memoria('dddddddd-0000-0000-0000-0000000000a3');
    if r.o_recuerdos <> 0 or r.o_mensajes <> 0 then raise exception 'FAIL: otro usuario alcanzó datos ajenos'; end if;
    raise notice 'PASS: otro usuario no puede olvidar recuerdos ajenos';
  end $$;
rollback;

-- ===========================================================================
-- 8 (040) — olvidar_todo_memoria: borra todos los recuerdos, excluye TODOS los mensajes y buscar_memoria no devuelve nada
-- ===========================================================================
begin;
  -- Fixtures (as postgres): sesion s1; turno 1 = m1 (user) + m2 (assistant), turno 2 = m3 (user) + m5 (assistant), m4 sin relación.
  -- a1 (reemplazado, de m3) <- a2 (vigente, corrige a1, de m1); a3 (vigente, otra clave, de m1).
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000c1', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura venía los martes', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b5', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura venía los martes', now() - interval '3 days' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura viene los jueves', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura viene los jueves', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Hola, qué tal', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int;
  begin
    select count(*) into n from buscar_memoria('Laura') b where b.o_fuente = 'mensaje';
    if n < 1 then raise exception 'FAIL: precondición: buscar_memoria debía encontrar mensajes antes de olvidar'; end if;

    select * into r from olvidar_todo_memoria();
    if r.o_recuerdos <> 3 then raise exception 'FAIL: debía alcanzar 3 recuerdos (%)', r.o_recuerdos; end if;
    select count(*) into n from memorias where usuario_id = auth.uid() and (estado <> 'borrado' or texto is not null);
    if n <> 0 then raise exception 'FAIL: quedó algún recuerdo con texto'; end if;
    raise notice 'PASS: olvidar todo deja todos los recuerdos borrados sin texto';

    select count(*) into n from mensajes_chat where usuario_id = auth.uid() and not excluido_memoria;
    if n <> 0 then raise exception 'FAIL: quedaron mensajes sin excluir (%)', n; end if;
    select count(*) into n from mensajes_chat where id like 'eeeeeeee-0000-0000-0000-0000000000b%';
    if n <> 5 then raise exception 'FAIL: los mensajes debían seguir visibles en el historial'; end if;
    raise notice 'PASS: todos los mensajes quedan excluidos y siguen en el historial';

    select count(*) into n from buscar_memoria('Laura');
    if n <> 0 then raise exception 'FAIL: buscar_memoria devolvió algo después de olvidar todo (%)', n; end if;
    select count(*) into n from buscar_memoria('Hola');
    if n <> 0 then raise exception 'FAIL: buscar_memoria devolvió mensajes después de olvidar todo (%)', n; end if;
    raise notice 'PASS: después de olvidar todo, buscar_memoria no devuelve ningún mensaje ni recuerdo';

    -- Un mensaje nuevo sí vuelve a contar.
    insert into mensajes_chat (usuario_id, sesion_id, role, contenido)
    values (auth.uid(), 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Mi nieta Sofía estudia medicina');
    select count(*) into n from buscar_memoria('Sofía medicina') b where b.o_fuente = 'mensaje';
    if n <> 1 then raise exception 'FAIL: un mensaje posterior debía poder encontrarse'; end if;
    raise notice 'PASS: los mensajes posteriores vuelven a contar';
  end $$;
rollback;

-- ===========================================================================
-- 9 (040) — borrar_recuerdos_de_sesiones_hasta: solo los recuerdos nacidos en sesiones anteriores al corte
-- ===========================================================================
begin;
  -- Fixtures (as postgres): sesion s1; turno 1 = m1 (user) + m2 (assistant), turno 2 = m3 (user) + m5 (assistant), m4 sin relación.
  -- a1 (reemplazado, de m3) <- a2 (vigente, corrige a1, de m1); a3 (vigente, otra clave, de m1).
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000c1', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura venía los martes', now() - interval '3 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b5', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura venía los martes', now() - interval '3 days' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Laura viene los jueves', now() - interval '4 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'assistant', 'Anotado, Laura viene los jueves', now() - interval '4 hours' + interval '1 second'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'Hola, qué tal', now() - interval '1 hour');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los martes', 'reemplazado', 'eeeeeeee-0000-0000-0000-0000000000b3');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, estado, corrige_id, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000a2', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'vigente', 'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000b1'),
    ('dddddddd-0000-0000-0000-0000000000a3', :user_a, 'otro', 'Laura', 'trabajo', 'Laura trabaja de tarde', 'vigente', null, 'eeeeeeee-0000-0000-0000-0000000000b1');
  update sesiones_chat set updated_at = now() - interval '2 days' where id = 'ffffffff-0000-0000-0000-0000000000c1';
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int; v text;
  begin
    n := borrar_recuerdos_de_sesiones_hasta(now() - interval '30 days');
    if n <> 0 then raise exception 'FAIL: un corte anterior a la sesión no debía borrar nada (%)', n; end if;
    n := borrar_recuerdos_de_sesiones_hasta(now() - interval '1 day');
    if n <> 3 then raise exception 'FAIL: debía borrar los 3 recuerdos de la sesión (%)', n; end if;
    select count(*) into n from memorias where usuario_id = auth.uid() and (estado <> 'borrado' or texto is not null);
    if n <> 0 then raise exception 'FAIL: quedó texto de recuerdos de mensajes que se borran'; end if;
    raise notice 'PASS: los recuerdos de sesiones que se borran quedan sin texto';
  end $$;
rollback;
