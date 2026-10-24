-- Reintentos del chat — tests para la migración 030 (acciones_agente).
--
-- Script psql a mano, mismo estilo que inventario-pastillas.sql: cada sección
-- es una transacción con ROLLBACK, no deja filas. Un run limpio imprime un
-- `NOTICE: PASS: ...` por aserción; un `FAIL:` aborta la sección.
--
-- Requisitos: migración 030 aplicada y DOS cuentas reales (user_a, user_b).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v user_a="'<uuid>'" -v user_b="'<uuid>'" \
--     -f supabase/tests/acciones-agente.sql

\set ON_ERROR_STOP on

-- 1 — Dueño: inserta, lee; la clave única impide duplicar el mismo pedido+clave
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into acciones_agente (usuario_id, pedido_id, clave)
  values (:user_a, 'bbbbbbbb-0000-0000-0000-000000000001', 'add_medication:{"name":"X"}');

  do $$
  declare n int;
  begin
    select count(*) into n from acciones_agente where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000001';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su fila'; end if;
    raise notice 'PASS: el dueño inserta y lee su claim';

    begin
      insert into acciones_agente (usuario_id, pedido_id, clave)
      values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'add_medication:{"name":"X"}');
      raise exception 'FAIL: la clave única permitió un duplicado';
    exception when unique_violation then
      raise notice 'PASS: unique (usuario, pedido, clave) bloquea el duplicado';
    end;
  end $$;
rollback;

-- 2 — Otro usuario: no ve, no inserta a nombre ajeno, no actualiza
begin;
  insert into acciones_agente (usuario_id, pedido_id, clave)
  values (:user_a, 'bbbbbbbb-0000-0000-0000-000000000002', 'mark_all_taken:{}');

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from acciones_agente where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000002';
    if n <> 0 then raise exception 'FAIL: otro usuario ve filas ajenas'; end if;
    raise notice 'PASS: select owner-only';

    update acciones_agente set resultado = '{}'::jsonb where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario actualizó una fila ajena'; end if;
    raise notice 'PASS: update owner-only';

    begin
      insert into acciones_agente (usuario_id, pedido_id, clave)
      values (:user_a, gen_random_uuid(), 'k');
      raise exception 'FAIL: otro usuario insertó a nombre ajeno';
    exception when insufficient_privilege then
      raise notice 'PASS: insert a nombre ajeno rechazado por RLS';
    end;
  end $$;
rollback;

-- 3 — Delete: el dueño libera su claim; otro usuario no borra filas ajenas
begin;
  insert into acciones_agente (usuario_id, pedido_id, clave)
  values (:user_a, 'bbbbbbbb-0000-0000-0000-000000000003', 'dest~add_medication:x');

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    delete from acciones_agente where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000003';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario borró una fila ajena'; end if;
    raise notice 'PASS: delete owner-only (ajeno no borra)';
  end $$;

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);

  do $$
  declare n int;
  begin
    delete from acciones_agente where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000003';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: el dueño no pudo borrar su claim'; end if;
    raise notice 'PASS: el dueño libera su claim';
  end $$;
rollback;

-- 4 — Filas pendiente:/confirmada: conviven con la acción; borrar pendientes no toca el resto
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into acciones_agente (usuario_id, pedido_id, clave, resultado) values
    (:user_a, 'bbbbbbbb-0000-0000-0000-000000000004', 'pendiente:dest~add_medication:x', null),
    (:user_a, 'bbbbbbbb-0000-0000-0000-000000000004', 'confirmada:dest~add_medication:x', null),
    (:user_a, 'bbbbbbbb-0000-0000-0000-000000000004', 'dest~add_medication:x', '{"contenido":"ok","accionUI":{"type":"medication_added"}}');

  do $$
  declare n int;
  begin
    select count(*) into n from acciones_agente where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000004';
    if n <> 3 then raise exception 'FAIL: la acción y sus filas de confirmación deberían convivir (%)', n; end if;
    raise notice 'PASS: pendiente/confirmada/acción conviven con la misma clave base';

    -- Mismo upsert idempotente que usa el servidor (ignoreDuplicates)
    insert into acciones_agente (usuario_id, pedido_id, clave)
    values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000004', 'pendiente:dest~add_medication:x')
    on conflict (usuario_id, pedido_id, clave) do nothing;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: la pendiente duplicada no debería insertarse'; end if;
    raise notice 'PASS: la pendiente es idempotente por (usuario, pedido, clave)';

    -- Rechazo: se borran las pendientes y solo ellas
    delete from acciones_agente where usuario_id = auth.uid() and clave like 'pendiente:%';
    select count(*) into n from acciones_agente where pedido_id = 'bbbbbbbb-0000-0000-0000-000000000004';
    if n <> 2 then raise exception 'FAIL: borrar pendientes tocó otras filas (%)', n; end if;
    raise notice 'PASS: el rechazo borra solo las pendientes';
  end $$;
rollback;
