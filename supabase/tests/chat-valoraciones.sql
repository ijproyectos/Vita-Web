-- Valoraciones de respuestas del chat (migración 060).
--
-- Script de psql, mismo estilo que memoria.sql: cada sección es su propia transacción y termina en ROLLBACK.
-- NO SE CORRIÓ al escribirlo (sin base de datos en la sesión de autoría): correrlo después de aplicar la 060.
--
-- Requisitos: migraciones hasta 060; dos cuentas REALES de auth.users (user_a dueño, user_b ajeno); conectarse como `postgres`.
-- Correr:
--   psql "<connection string>" -v user_a="'<uuid>'" -v user_b="'<uuid>'" -f supabase/tests/chat-valoraciones.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — El dueño valora un mensaje del asistente propio, lo ve y puede cambiarlo; un ajeno no ve nada
-- ===========================================================================
begin;
  insert into sesiones_chat (id, usuario_id) values ('cccccccc-0000-0000-0000-000000000001', :user_a);
  insert into mensajes_chat (id, sesion_id, usuario_id, role, contenido) values
    ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001', :user_a, 'assistant', 'respuesta'),
    ('cccccccc-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-000000000001', :user_a, 'user', 'pregunta');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int; v smallint;
  begin
    insert into chat_valoraciones (usuario_id, mensaje_id, valor, motivo)
    values (auth.uid(), 'cccccccc-0000-0000-0000-0000000000a1', -1, 'No entendió');
    select count(*) into n from chat_valoraciones;
    if n <> 1 then raise exception 'FAIL: el dueño no ve su valoración'; end if;
    update chat_valoraciones set valor = 1, motivo = null, updated_at = now()
     where mensaje_id = 'cccccccc-0000-0000-0000-0000000000a1';
    select valor into v from chat_valoraciones where mensaje_id = 'cccccccc-0000-0000-0000-0000000000a1';
    if v <> 1 then raise exception 'FAIL: no se pudo cambiar la valoración'; end if;
    raise notice 'PASS: el dueño valora y cambia su valoración';
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from chat_valoraciones;
    if n <> 0 then raise exception 'FAIL: un ajeno ve valoraciones'; end if;
    raise notice 'PASS: un ajeno no ve valoraciones';
  end $$;
  reset role;
rollback;

-- ===========================================================================
-- 2 — No se puede valorar un mensaje del usuario, ajeno, ni a nombre de otro; valor y motivo validados
-- ===========================================================================
begin;
  insert into sesiones_chat (id, usuario_id) values ('cccccccc-0000-0000-0000-000000000002', :user_a);
  insert into mensajes_chat (id, sesion_id, usuario_id, role, contenido) values
    ('cccccccc-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-000000000002', :user_a, 'assistant', 'respuesta'),
    ('cccccccc-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-000000000002', :user_a, 'user', 'pregunta');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    begin
      insert into chat_valoraciones (usuario_id, mensaje_id, valor) values (auth.uid(), 'cccccccc-0000-0000-0000-0000000000b2', 1);
      raise exception 'FAIL: dejó valorar un mensaje del usuario';
    exception when insufficient_privilege or check_violation then null;
    end;
    raise notice 'PASS: no se valora un mensaje del usuario';
    begin
      insert into chat_valoraciones (usuario_id, mensaje_id, valor) values (auth.uid(), 'cccccccc-0000-0000-0000-0000000000b1', 0);
      raise exception 'FAIL: aceptó valor 0';
    exception when check_violation then null;
    end;
    raise notice 'PASS: valor fuera de -1/1 rechazado';
    begin
      insert into chat_valoraciones (usuario_id, mensaje_id, valor, motivo)
      values (auth.uid(), 'cccccccc-0000-0000-0000-0000000000b1', -1, repeat('x', 201));
      raise exception 'FAIL: aceptó un motivo de más de 200';
    exception when check_violation then null;
    end;
    raise notice 'PASS: motivo largo rechazado';
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    begin
      insert into chat_valoraciones (usuario_id, mensaje_id, valor) values (auth.uid(), 'cccccccc-0000-0000-0000-0000000000b1', 1);
      raise exception 'FAIL: un ajeno valoró un mensaje que no es suyo';
    exception when insufficient_privilege or check_violation then null;
    end;
    raise notice 'PASS: no se valora un mensaje ajeno';
    begin
      insert into chat_valoraciones (usuario_id, mensaje_id, valor) values ('cccccccc-0000-0000-0000-00000000ffff', 'cccccccc-0000-0000-0000-0000000000b1', 1);
      raise exception 'FAIL: escribió a nombre de otro';
    exception when insufficient_privilege or check_violation or foreign_key_violation then null;
    end;
    raise notice 'PASS: no se escribe a nombre de otro';
  end $$;
  reset role;
rollback;

-- ===========================================================================
-- 3 — Una sola valoración por mensaje y la cascada con mensajes_chat
-- ===========================================================================
begin;
  insert into sesiones_chat (id, usuario_id) values ('cccccccc-0000-0000-0000-000000000003', :user_a);
  insert into mensajes_chat (id, sesion_id, usuario_id, role, contenido) values
    ('cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-000000000003', :user_a, 'assistant', 'respuesta');
  insert into chat_valoraciones (usuario_id, mensaje_id, valor) values (:user_a, 'cccccccc-0000-0000-0000-0000000000c1', 1);
  do $$
  declare n int;
  begin
    begin
      insert into chat_valoraciones (usuario_id, mensaje_id, valor)
      select usuario_id, mensaje_id, -1 from chat_valoraciones where mensaje_id = 'cccccccc-0000-0000-0000-0000000000c1';
      raise exception 'FAIL: dejó duplicar la valoración';
    exception when unique_violation then null;
    end;
    raise notice 'PASS: una valoración por mensaje';
    delete from mensajes_chat where id = 'cccccccc-0000-0000-0000-0000000000c1';
    select count(*) into n from chat_valoraciones where mensaje_id = 'cccccccc-0000-0000-0000-0000000000c1';
    if n <> 0 then raise exception 'FAIL: la valoración sobrevivió al borrado del mensaje'; end if;
    raise notice 'PASS: la valoración se borra con el mensaje';
  end $$;
rollback;
