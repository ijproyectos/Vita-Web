-- Retención del chat (7 días) — tests de la migración 051 y de la premisa "los recuerdos sobreviven a los mensajes".
--
-- Script psql a mano: una transacción con ROLLBACK. Una corrida limpia imprime `NOTICE: PASS: ...` por aserción;
-- cualquier `FAIL:` aborta. Conectar como `postgres` (pooler). Requisito: migración 051 aplicada.
--
-- Correr:
--   psql "<pooler connection string>" -f supabase/tests/chat-retencion.sql

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
