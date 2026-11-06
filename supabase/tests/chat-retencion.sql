-- Retención del chat (7 días) — tests de la migración 051 y de la premisa "los recuerdos sobreviven a los mensajes".
--
-- Script psql a mano: una transacción con ROLLBACK. Una corrida limpia imprime `NOTICE: PASS: ...` por aserción;
-- cualquier `FAIL:` aborta. Conectar como `postgres` (pooler). Requisito: migración 051 aplicada.
--
-- Correr:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -f supabase/tests/chat-retencion.sql
--   (user_a = cuenta real de auth.users; solo las secciones 2 y 3 la usan, dentro de transacciones que se revierten)

\set ON_ERROR_STOP on

begin;
  do $$
  declare n int;
  begin
    -- Índices de los barridos por fecha
    select count(*) into n from pg_indexes where schemaname = 'public' and indexname in ('idx_mensajes_chat_creado', 'idx_sesiones_chat_actualizada');
    if n <> 2 then raise exception 'FAIL: faltan los indices de retencion (%/2)', n; end if;
    raise notice 'PASS: indices de retencion presentes';

    -- Ninguna FK apunta a mensajes_chat desde las tablas de memoria: borrar mensajes no arrastra recuerdos ni resumen.
    select count(*) into n
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'public.mensajes_chat'::regclass
       and c.conrelid in (
         select oid from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in ('memorias', 'resumen_conversacion', 'registros_chat', 'acciones_agente')
       );
    if n <> 0 then raise exception 'FAIL: % FK desde memoria/registros hacia mensajes_chat', n; end if;
    raise notice 'PASS: ninguna tabla de memoria depende por FK de mensajes_chat';

    -- La única cascada hacia mensajes_chat es la de sesiones_chat (borrar una sesión vacía no pierde nada).
    select count(*) into n from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.mensajes_chat'::regclass;
    raise notice 'INFO: % FK hacia mensajes_chat en total', n;
  end $$;
rollback;

-- 2 — borrar_recuerdos_hasta: por fecha del mensaje de origen, y también si el mensaje ya no existe
begin;
  insert into sesiones_chat (id, usuario_id, created_at, updated_at)
  values ('eeeeeeee-0000-0000-0000-000000000001', :user_a, now() - interval '10 days', now());
  -- viejo (origen anterior al corte), nuevo (origen posterior), huérfano viejo (origen borrado), huérfano nuevo, sin origen
  insert into mensajes_chat (id, sesion_id, usuario_id, role, contenido, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', :user_a, 'user', 'viejo', now() - interval '6 days'),
    ('eeeeeeee-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001', :user_a, 'user', 'nuevo', now() - interval '1 day');
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, mensaje_origen_id, created_at) values
    ('eeeeeeee-0000-0000-0000-0000000000b1', :user_a, 'yo', 't_viejo',   'a', 'eeeeeeee-0000-0000-0000-0000000000a1', now() - interval '6 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b2', :user_a, 'yo', 't_nuevo',   'b', 'eeeeeeee-0000-0000-0000-0000000000a2', now() - interval '1 day'),
    ('eeeeeeee-0000-0000-0000-0000000000b3', :user_a, 'yo', 't_huerf_v', 'c', 'eeeeeeee-0000-0000-0000-0000000000ff', now() - interval '20 days'),
    ('eeeeeeee-0000-0000-0000-0000000000b4', :user_a, 'yo', 't_huerf_n', 'd', 'eeeeeeee-0000-0000-0000-0000000000fe', now() - interval '1 day'),
    ('eeeeeeee-0000-0000-0000-0000000000b5', :user_a, 'yo', 't_manual',  'e', null, now() - interval '20 days');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int; est text;
  begin
    select borrar_recuerdos_hasta(now() - interval '3 days') into n;
    if n <> 2 then raise exception 'FAIL: borro % recuerdos (esperaba 2: el viejo y el huerfano viejo)', n; end if;
    select estado into est from memorias where id = 'eeeeeeee-0000-0000-0000-0000000000b1';
    if est <> 'borrado' then raise exception 'FAIL: el recuerdo de origen viejo sigue vigente'; end if;
    select estado into est from memorias where id = 'eeeeeeee-0000-0000-0000-0000000000b3';
    if est <> 'borrado' then raise exception 'FAIL: el recuerdo huerfano viejo sigue vigente'; end if;
    select estado into est from memorias where id in ('eeeeeeee-0000-0000-0000-0000000000b2');
    if est = 'borrado' then raise exception 'FAIL: borro un recuerdo de origen nuevo'; end if;
    select estado into est from memorias where id = 'eeeeeeee-0000-0000-0000-0000000000b4';
    if est = 'borrado' then raise exception 'FAIL: borro un huerfano posterior al corte'; end if;
    select estado into est from memorias where id = 'eeeeeeee-0000-0000-0000-0000000000b5';
    if est = 'borrado' then raise exception 'FAIL: borro un recuerdo manual (sin origen)'; end if;
    raise notice 'PASS: borrar_recuerdos_hasta cubre origen viejo y huerfanos, respeta lo nuevo y lo manual';
  end $$;
  reset role;
rollback;

-- 3 — purgar_sesiones_vacias: nunca borra la más reciente ni una sesión con mensajes
begin;
  insert into sesiones_chat (id, usuario_id, created_at, updated_at) values
    ('eeeeeeee-0000-0000-0000-000000000011', :user_a, now() - interval '30 days', now() - interval '30 days'),
    ('eeeeeeee-0000-0000-0000-000000000012', :user_a, now() - interval '20 days', now() - interval '20 days'),
    ('eeeeeeee-0000-0000-0000-000000000013', :user_a, now() - interval '10 days', now() - interval '10 days');
  insert into mensajes_chat (id, sesion_id, usuario_id, role, contenido, created_at)
  values ('eeeeeeee-0000-0000-0000-0000000000c1', 'eeeeeeee-0000-0000-0000-000000000012', :user_a, 'user', 'x', now() - interval '20 days');
  do $$
  declare n int; resto int;
  begin
    perform purgar_sesiones_vacias(now() - interval '7 days', 1000);
    select count(*) into resto from sesiones_chat where id = 'eeeeeeee-0000-0000-0000-000000000011';
    if resto <> 0 then raise exception 'FAIL: no borro la sesion vacia vieja'; end if;
    select count(*) into resto from sesiones_chat where id = 'eeeeeeee-0000-0000-0000-000000000012';
    if resto <> 1 then raise exception 'FAIL: borro una sesion con mensajes'; end if;
    select count(*) into resto from sesiones_chat where id = 'eeeeeeee-0000-0000-0000-000000000013';
    if resto <> 1 then raise exception 'FAIL: borro la sesion mas reciente del usuario'; end if;
    raise notice 'PASS: purgar_sesiones_vacias conserva la mas reciente y las ocupadas';
  end $$;
rollback;
