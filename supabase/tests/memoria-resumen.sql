-- Memoria (fase 3) — tests de la migración 041 (resumen incremental y cola).
--   1  RLS: el dueño lee su resumen; otro usuario no ve nada; nadie escribe directo.
--   2  marcar_resumen_pendiente: umbral, excluidos y memoria apagada.
--   3  tomar / guardar / completar: control optimista, reserva y abandono a los 5 intentos.
--   4  invalidar_resumen y las funciones de privacidad de la 040 (reemplazadas por la 041) vacían el resumen y suben la versión.
--   5  Permisos: las funciones del trabajador no las ejecuta un usuario.
--
-- Script de psql escrito a mano, mismo estilo que memoria.sql: cada sección es su propia transacción y termina en ROLLBACK.
-- NO SE CORRIÓ al escribirlo (sin base de datos en la sesión de autoría): correrlo después de aplicar la 041.
-- Requisitos: migraciones hasta 041 aplicadas; dos cuentas REALES de auth.users (user_a, user_b); conectarse como `postgres`.
-- Correr:
--   psql "<connection string>" -v user_a="'<uuid>'" -v user_b="'<uuid>'" -f supabase/tests/memoria-resumen.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — RLS owner-only, sin escritura directa
-- ===========================================================================
begin;
  insert into resumen_conversacion (usuario_id, resumen) values (:user_a, 'Resumen de prueba');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from resumen_conversacion;
    if n <> 1 then raise exception 'FAIL: el dueño no ve su resumen (%)', n; end if;
    raise notice 'PASS: el dueño ve su resumen';
    begin
      update resumen_conversacion set resumen = 'pisado';
      get diagnostics n = row_count;
      raise exception 'FAIL: el dueño pudo actualizar directo (% filas)', n;
    exception when insufficient_privilege then
      raise notice 'PASS: el dueño no escribe directo';
    end;
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from resumen_conversacion;
    if n <> 0 then raise exception 'FAIL: otro usuario ve un resumen ajeno (%)', n; end if;
    raise notice 'PASS: otro usuario no ve resúmenes ajenos';
  end $$;
rollback;

-- ===========================================================================
-- 2 — marcar_resumen_pendiente
-- ===========================================================================
begin;
  update perfiles set memoria_activa = true where id = :user_a;
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000d1', :user_a);
  insert into mensajes_chat (usuario_id, sesion_id, role, contenido, created_at)
  select :user_a, 'ffffffff-0000-0000-0000-0000000000d1', case when g % 2 = 1 then 'user' else 'assistant' end, 'mensaje ' || g,
         now() - make_interval(mins => 100 - g)
    from generate_series(1, 10) g;

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r boolean; n int;
  begin
    r := marcar_resumen_pendiente(16);
    if r then raise exception 'FAIL: marcó con 10 mensajes y umbral 16'; end if;
    raise notice 'PASS: bajo el umbral no marca';
    r := marcar_resumen_pendiente(8);
    if not r then raise exception 'FAIL: no marcó con 10 mensajes y umbral 8'; end if;
    select count(*) into n from resumen_conversacion where pendiente_desde is not null;
    if n <> 1 then raise exception 'FAIL: no quedó la marca pendiente'; end if;
    raise notice 'PASS: sobre el umbral marca';
  end $$;
  reset role;

  -- Los excluidos no cuentan.
  update mensajes_chat set excluido_memoria = true where usuario_id = :user_a;
  update resumen_conversacion set pendiente_desde = null where usuario_id = :user_a;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    if marcar_resumen_pendiente(8) then raise exception 'FAIL: contó mensajes excluidos de la memoria'; end if;
    raise notice 'PASS: los excluidos no cuentan para el umbral';
  end $$;
  reset role;

  -- Memoria apagada: no marca.
  update mensajes_chat set excluido_memoria = false where usuario_id = :user_a;
  update perfiles set memoria_activa = false where id = :user_a;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    if marcar_resumen_pendiente(8) then raise exception 'FAIL: marcó con la memoria apagada'; end if;
    raise notice 'PASS: con la memoria apagada no marca';
  end $$;
rollback;

-- ===========================================================================
-- 3 — tomar / guardar / completar
-- ===========================================================================
begin;
  update perfiles set memoria_activa = true where id = :user_a;
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000d2', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000d1', :user_a, 'ffffffff-0000-0000-0000-0000000000d2', 'user', 'hola', now() - interval '3 hours'),
    ('eeeeeeee-0000-0000-0000-0000000000d2', :user_a, 'ffffffff-0000-0000-0000-0000000000d2', 'assistant', 'chau', now() - interval '2 hours');
  insert into resumen_conversacion (usuario_id, pendiente_desde) values (:user_a, now());
  select set_config('app.a', (:user_a)::text, true);

  do $$
  declare t record; g record; n int; v int; a uuid := current_setting('app.a')::uuid;
  begin
    select * into t from tomar_resumenes_pendientes(10) where o_usuario_id = a;
    if t.o_usuario_id is null or t.o_intentos <> 1 then raise exception 'FAIL: no tomó la tarea'; end if;
    select count(*) into n from tomar_resumenes_pendientes(10) where o_usuario_id = a;
    if n <> 0 then raise exception 'FAIL: tomó una tarea con la reserva vigente'; end if;
    raise notice 'PASS: toma con reserva y no la toma dos veces';

    select count(*) into n from mensajes_para_resumen(a, 10);
    if n <> 2 then raise exception 'FAIL: mensajes_para_resumen devolvió % filas', n; end if;

    select * into g from guardar_resumen(a, 'nuevo', '["x"]'::jsonb, 'eeeeeeee-0000-0000-0000-0000000000d1', now() - interval '3 hours', t.o_version + 99);
    if g.o_guardado then raise exception 'FAIL: guardó con una versión equivocada'; end if;
    select * into g from guardar_resumen(a, 'nuevo', '["x"]'::jsonb, 'eeeeeeee-0000-0000-0000-0000000000d1', now() - interval '3 hours', t.o_version);
    if not g.o_guardado then raise exception 'FAIL: no guardó con la versión correcta'; end if;
    select count(*) into n from mensajes_para_resumen(a, 10);
    if n <> 1 then raise exception 'FAIL: el cursor no avanzó (% filas)', n; end if;
    select count(*) into n from resumen_conversacion r where r.usuario_id = a and r.pendiente_desde is null and r.intentos = 0 and r.resumen = 'nuevo';
    if n <> 1 then raise exception 'FAIL: guardar no limpió la cola'; end if;
    raise notice 'PASS: guardar respeta la versión, mueve el cursor y limpia la cola';

    select * into g from guardar_resumen(a, 'otro', '[]'::jsonb, '99999999-0000-0000-0000-000000000000', now(), t.o_version + 1);
    if g.o_guardado then raise exception 'FAIL: guardó con un cursor que no existe'; end if;
    raise notice 'PASS: no guarda con un último mensaje cubierto inexistente';

    -- Fallos: reintento con espera y abandono a los 5 intentos.
    update resumen_conversacion r set pendiente_desde = now(), intentos = 5, reservada_hasta = now() + interval '1 minute' where r.usuario_id = a;
    perform completar_resumen(a, false, 'db');
    select count(*) into n from resumen_conversacion r where r.usuario_id = a and r.pendiente_desde is null;
    if n <> 1 then raise exception 'FAIL: no abandonó a los 5 intentos'; end if;
    raise notice 'PASS: abandona la tarea a los 5 intentos';
  end $$;
rollback;

-- ===========================================================================
-- 4 — Privacidad: invalidar y las funciones de la 040 vacían el resumen y suben la versión
-- ===========================================================================
begin;
  update perfiles set memoria_activa = true where id = :user_a;
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000d3', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000e1', :user_a, 'ffffffff-0000-0000-0000-0000000000d3', 'user', 'Laura viene los jueves', now() - interval '3 days');
  insert into memorias (id, usuario_id, sobre_tipo, sobre_nombre, clave, texto, mensaje_origen_id) values
    ('dddddddd-0000-0000-0000-0000000000e1', :user_a, 'otro', 'Laura', 'dia_visita', 'Laura viene los jueves', 'eeeeeeee-0000-0000-0000-0000000000e1');
  insert into resumen_conversacion (usuario_id, resumen, pendientes, version, pendiente_desde)
  values (:user_a, 'Hablaron de Laura', '["algo"]'::jsonb, 3, now());
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record;
  begin
    perform invalidar_resumen();
    select * into r from resumen_conversacion where usuario_id = auth.uid();
    if r.resumen <> '' or r.pendientes <> '[]'::jsonb or r.version <> 4 or r.pendiente_desde is not null then
      raise exception 'FAIL: invalidar_resumen no vació / no subió la versión';
    end if;
    raise notice 'PASS: invalidar_resumen vacía el resumen y sube la versión';

  end $$;
  reset role;

  update resumen_conversacion set resumen = 'Hablaron de Laura' where usuario_id = :user_a;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; v0 int; x record;
  begin
    select version into v0 from resumen_conversacion where usuario_id = auth.uid();
    select * into x from olvidar_memoria('dddddddd-0000-0000-0000-0000000000e1');
    select * into r from resumen_conversacion where usuario_id = auth.uid();
    if r.resumen <> '' or r.version <= v0 then raise exception 'FAIL: olvidar_memoria no invalidó el resumen'; end if;
    raise notice 'PASS: olvidar_memoria invalida el resumen';
  end $$;
  reset role;

  update resumen_conversacion set resumen = 'Otra vez' where usuario_id = :user_a;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; v0 int; x record;
  begin
    select version into v0 from resumen_conversacion where usuario_id = auth.uid();
    select * into x from olvidar_todo_memoria();
    select * into r from resumen_conversacion where usuario_id = auth.uid();
    if r.resumen <> '' or r.version <= v0 then raise exception 'FAIL: olvidar_todo_memoria no invalidó el resumen'; end if;
    raise notice 'PASS: olvidar_todo_memoria invalida el resumen';
  end $$;
  reset role;

  update resumen_conversacion set resumen = 'Antes de borrar' where usuario_id = :user_a;
  update sesiones_chat set updated_at = now() - interval '2 days' where id = 'ffffffff-0000-0000-0000-0000000000d3';
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r record; n int;
  begin
    n := borrar_recuerdos_de_sesiones_hasta(now() - interval '30 days');
    select * into r from resumen_conversacion where usuario_id = auth.uid();
    if r.resumen = '' then raise exception 'FAIL: invalidó sin que hubiera sesiones por borrar'; end if;
    n := borrar_recuerdos_de_sesiones_hasta(now() - interval '1 day');
    select * into r from resumen_conversacion where usuario_id = auth.uid();
    if r.resumen <> '' then raise exception 'FAIL: borrar historial no invalidó el resumen'; end if;
    raise notice 'PASS: borrar historial invalida el resumen solo si hay sesiones por borrar';
  end $$;
rollback;

-- ===========================================================================
-- 5 — Permisos: el trabajador no es invocable por un usuario
-- ===========================================================================
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    begin
      perform tomar_resumenes_pendientes(1);
      raise exception 'FAIL: un usuario ejecutó tomar_resumenes_pendientes';
    exception when insufficient_privilege then
      raise notice 'PASS: tomar_resumenes_pendientes no es ejecutable por usuarios';
    end;
    begin
      perform guardar_resumen(auth.uid(), 'x', '[]'::jsonb, null, null, 1);
      raise exception 'FAIL: un usuario ejecutó guardar_resumen';
    exception when insufficient_privilege then
      raise notice 'PASS: guardar_resumen no es ejecutable por usuarios';
    end;
  end $$;
rollback;
