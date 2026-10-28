-- Límite de pedidos — tests para la migración 035 (limites_pedidos + contar_pedido).
--
-- Script psql a mano: cada sección es una transacción con ROLLBACK. Un run limpio imprime un
-- `NOTICE: PASS: ...` por aserción. Requisitos: migración 035 aplicada y una cuenta real (user_a).
--
-- Run:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -f supabase/tests/limite-pedidos.sql

\set ON_ERROR_STOP on

-- 1 — contar_pedido incrementa de a uno por (clave, ventana) y separa ventanas
begin;
  do $$
  declare a int; b int; c int;
  begin
    a := contar_pedido('chat:u:test:min', '2026-10-28 15:30:00+00');
    b := contar_pedido('chat:u:test:min', '2026-10-28 15:30:00+00');
    c := contar_pedido('chat:u:test:min', '2026-10-28 15:31:00+00');
    if a <> 1 or b <> 2 then raise exception 'FAIL: la cuenta no sube de a uno (% %)', a, b; end if;
    if c <> 1 then raise exception 'FAIL: otra ventana no arranca en 1 (%)', c; end if;
    raise notice 'PASS: contar_pedido incrementa por ventana';
  end $$;
rollback;

-- 2 — Un usuario autenticado no ve la tabla ni ejecuta la función (solo service_role)
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    begin
      perform contar_pedido('chat:u:x:min', now());
      raise exception 'FAIL: authenticated ejecutó contar_pedido';
    exception when insufficient_privilege then
      raise notice 'PASS: contar_pedido no es ejecutable por authenticated';
    end;
    begin
      select count(*) into n from limites_pedidos;
      raise exception 'FAIL: authenticated lee limites_pedidos';
    exception when insufficient_privilege then
      raise notice 'PASS: limites_pedidos sin acceso para authenticated';
    end;
  end $$;
rollback;
