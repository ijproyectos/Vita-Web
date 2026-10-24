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
