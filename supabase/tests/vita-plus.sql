-- vita+ (Mercado Pago) — tests para la migración 044.
--
-- Script psql a mano: cada sección es una transacción con ROLLBACK, y empieza borrando lo que la cuenta de prueba
-- ya tuviera de vita+ (dentro de la transacción, no se persiste). Un run limpio imprime un `NOTICE: PASS: ...` por
-- aserción. Requisitos: migración 044 aplicada y dos cuentas reales (user_a, user_b).
--
-- Run:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -v user_b="'<uuid>'" -f supabase/tests/vita-plus.sql

\set ON_ERROR_STOP on

-- 1 — iniciar crea la fila pendiente con el precio guardado; segundo intento seguido = create_throttled
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  do $$
  declare
    v_id uuid;
    v_ars int;
    v_fx numeric;
  begin
    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000001', 'mensual', 1, 499, 1560, 7784);
    select s.ars_pesos, s.fx_ars into v_ars, v_fx from public.vita_plus_suscripciones s where s.id = v_id;
    if v_ars <> 7784 or v_fx <> 1560 then raise exception 'FAIL: no guardó pesos/cotización (% %)', v_ars, v_fx; end if;
    raise notice 'PASS: iniciar guarda plan, dólar y pesos por suscripción';

    begin
      perform public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000002', 'mensual', 1, 499, 1560, 7784);
      raise exception 'FAIL: permitió dos creaciones seguidas';
    exception when sqlstate '54000' then
      if sqlerrm not like '%create_throttled%' then raise exception 'FAIL: error inesperado %', sqlerrm; end if;
      raise notice 'PASS: segunda creación seguida = create_throttled';
    end;
  end $$;
rollback;

-- 2 — plan y meses inconsistentes se rechazan; con suscripción autorizada no se puede crear otra
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  do $$
  declare
    v_id uuid;
  begin
    begin
      perform public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000003', 'anual', 1, 3588, 1560, 55973);
      raise exception 'FAIL: aceptó anual con 1 mes';
    exception when check_violation then
      raise notice 'PASS: plan y meses inconsistentes rechazados';
    end;

    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000004', 'mensual', 1, 499, 1560, 7784);
    perform public.actualizar_estado_suscripcion_vita_plus(v_id, 'authorized', 'pre-test-1');
    update public.vita_plus_suscripciones set creada_at = now() - interval '5 minutes' where id = v_id;
    begin
      perform public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000005', 'mensual', 1, 499, 1560, 7784);
      raise exception 'FAIL: permitió otra con una autorizada';
    exception when sqlstate '54000' then
      if sqlerrm not like '%already_subscribed%' then raise exception 'FAIL: error inesperado %', sqlerrm; end if;
      raise notice 'PASS: ya suscripto = already_subscribed';
    end;
  end $$;
rollback;

-- 3 — registrar_pago: acredita meses de la suscripción, es idempotente, acumula y rechaza montos distintos
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  delete from public.vita_plus_vigencia where usuario_id = :user_a;
  do $$
  declare
    v_id uuid;
    v_vence1 timestamptz;
    v_vence2 timestamptz;
    v_repetido timestamptz;
    v_pagos int;
  begin
    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000006', 'anual', 12, 3588, 1560, 55973);
    v_vence1 := public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-1', v_id, 55973);
    if v_vence1 is null or v_vence1 < now() + interval '11 months 28 days' then
      raise exception 'FAIL: anual no otorgó ~12 meses (%)', v_vence1;
    end if;
    raise notice 'PASS: pago anual otorga 12 meses';

    v_repetido := public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-1', v_id, 55973);
    select count(*) into v_pagos from public.vita_plus_pagos where usuario_id = current_setting('app.a')::uuid;
    if v_repetido is not null or v_pagos <> 1 then raise exception 'FAIL: el reenvío acreditó dos veces'; end if;
    raise notice 'PASS: mismo pago dos veces acredita una sola';

    v_vence2 := public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-2', v_id, 55973);
    if v_vence2 < v_vence1 + interval '11 months 28 days' then
      raise exception 'FAIL: un segundo pago no se sumó al vencimiento (% -> %)', v_vence1, v_vence2;
    end if;
    raise notice 'PASS: un cobro posterior suma al vencimiento vigente';

    begin
      perform public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-3', v_id, 100);
      raise exception 'FAIL: aceptó un monto distinto al guardado';
    exception when sqlstate '22023' then
      if sqlerrm not like '%amount_mismatch%' then raise exception 'FAIL: error inesperado %', sqlerrm; end if;
      raise notice 'PASS: monto distinto al guardado rechazado';
    end;

    begin
      perform public.registrar_pago_vita_plus(current_setting('app.b')::uuid, 'pago-test-4', v_id, 55973);
      raise exception 'FAIL: acreditó una suscripción ajena';
    exception when sqlstate 'P0002' then
      raise notice 'PASS: la suscripción debe ser de la persona acreditada';
    end;
  end $$;
rollback;

-- 4 — cancelled es terminal y no toca la vigencia
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  delete from public.vita_plus_vigencia where usuario_id = :user_a;
  do $$
  declare
    v_id uuid;
    v_estado text;
    v_activo boolean;
  begin
    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000007', 'mensual', 1, 499, 1560, 7784);
    perform public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-5', v_id, 7784);
    perform public.actualizar_estado_suscripcion_vita_plus(v_id, 'cancelled', 'pre-test-2');
    perform public.actualizar_estado_suscripcion_vita_plus(v_id, 'authorized');
    select s.estado into v_estado from public.vita_plus_suscripciones s where s.id = v_id;
    if v_estado <> 'cancelled' then raise exception 'FAIL: cancelled se reabrió (%)', v_estado; end if;
    raise notice 'PASS: cancelled es terminal';

    select exists (select 1 from public.vita_plus_vigencia v where v.usuario_id = current_setting('app.a')::uuid and v.vence_at > now()) into v_activo;
    if not v_activo then raise exception 'FAIL: cancelar quitó la vigencia'; end if;
    raise notice 'PASS: cancelar no toca la vigencia pagada';
  end $$;
rollback;

-- 5 — la sesión ve solo lo suyo, lee su estado y no ejecuta las funciones de escritura
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id in (:user_a, :user_b);
  delete from public.vita_plus_vigencia where usuario_id in (:user_a, :user_b);
  do $$
  declare v_id uuid; v_id_b uuid;
  begin
    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000008', 'mensual', 1, 499, 1560, 7784);
    perform public.actualizar_estado_suscripcion_vita_plus(v_id, 'authorized', 'pre-test-3');
    perform public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-6', v_id, 7784);
    v_id_b := public.iniciar_suscripcion_vita_plus(current_setting('app.b')::uuid, 'ref-test-0000000000000009', 'mensual', 1, 499, 1560, 7784);
  end $$;

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare
    n int;
    e record;
  begin
    select count(*) into n from public.vita_plus_suscripciones;
    if n <> 1 then raise exception 'FAIL: la sesión ve % suscripciones (esperaba solo la suya)', n; end if;
    raise notice 'PASS: la sesión solo ve sus suscripciones';

    select * into e from public.mi_estado_vita_plus();
    if not e.vp_activo or e.vp_estado <> 'authorized' or not e.vp_renueva or e.vp_plan <> 'mensual' then
      raise exception 'FAIL: mi_estado_vita_plus incorrecto (% % % %)', e.vp_activo, e.vp_estado, e.vp_renueva, e.vp_plan;
    end if;
    if not public.vita_plus_activo() then raise exception 'FAIL: vita_plus_activo falso'; end if;
    raise notice 'PASS: mi_estado_vita_plus y vita_plus_activo reflejan la suscripción';

    begin
      perform public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-hack', (select id from public.vita_plus_suscripciones limit 1), 7784);
      raise exception 'FAIL: authenticated ejecutó registrar_pago_vita_plus';
    exception when insufficient_privilege then
      raise notice 'PASS: registrar_pago_vita_plus no es ejecutable por authenticated';
    end;

    begin
      perform public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-hack-00000000000000', 'mensual', 1, 499, 1, 1);
      raise exception 'FAIL: authenticated ejecutó iniciar_suscripcion_vita_plus';
    exception when insufficient_privilege then
      raise notice 'PASS: la sesión no puede fijar su propio precio';
    end;

    begin
      insert into public.vita_plus_vigencia (usuario_id, vence_at) values (current_setting('app.a')::uuid, now() + interval '10 years');
      raise exception 'FAIL: authenticated escribió vigencia';
    exception when insufficient_privilege then
      raise notice 'PASS: la vigencia no es escribible por la sesión';
    end;
  end $$;
rollback;

-- 6 — 'pending' nunca degrada un estado más avanzado
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  do $$
  declare v_id uuid; v_estado text;
  begin
    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000010', 'mensual', 1, 499, 1560, 7784);
    perform public.actualizar_estado_suscripcion_vita_plus(v_id, 'authorized', 'pre-test-10');
    perform public.actualizar_estado_suscripcion_vita_plus(v_id, 'pending', 'pre-test-10');
    select s.estado into v_estado from public.vita_plus_suscripciones s where s.id = v_id;
    if v_estado <> 'authorized' then raise exception 'FAIL: pending degradó authorized (%)', v_estado; end if;
    raise notice 'PASS: pending no degrada';
  end $$;
rollback;

-- 7 — cobros no acreditados: idempotentes y solo service_role
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  do $$
  declare n int;
  begin
    perform public.anotar_pago_no_acreditado_vita_plus('pago-na-1', 'pago-na-1', 'pre-x', 'ref-x', 'monto_distinto', 100, 'ARS', 'approved');
    perform public.anotar_pago_no_acreditado_vita_plus('pago-na-1', 'pago-na-1', 'pre-x', 'ref-x', 'monto_distinto', 100, 'ARS', 'approved');
    select count(*) into n from public.vita_plus_pagos_no_acreditados where clave = 'pago-na-1';
    if n <> 1 then raise exception 'FAIL: el reenvío duplicó la fila (%)', n; end if;
    raise notice 'PASS: anotar_pago_no_acreditado es idempotente';
  end $$;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  begin
    begin
      perform count(*) from public.vita_plus_pagos_no_acreditados;
      raise exception 'FAIL: authenticated lee pagos_no_acreditados';
    exception when insufficient_privilege then
      raise notice 'PASS: pagos_no_acreditados sin acceso para authenticated';
    end;
  end $$;
rollback;

-- 8 — botón de arrepentimiento: solo dentro de los 10 días del primer cobro, idempotente
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  do $$
  declare v_id uuid; r record; e record;
  begin
    begin
      perform public.solicitar_arrepentimiento_vita_plus(current_setting('app.a')::uuid);
      raise exception 'FAIL: permitió arrepentirse sin haber pagado';
    exception when sqlstate '54000' then
      raise notice 'PASS: sin cobro no hay arrepentimiento';
    end;

    v_id := public.iniciar_suscripcion_vita_plus(current_setting('app.a')::uuid, 'ref-test-0000000000000011', 'mensual', 1, 499, 1560, 7784);
    perform public.registrar_pago_vita_plus(current_setting('app.a')::uuid, 'pago-test-arr-1', v_id, 7784);
    select * into r from public.solicitar_arrepentimiento_vita_plus(current_setting('app.a')::uuid);
    if r.vp_suscripcion <> v_id or not r.vp_nueva then raise exception 'FAIL: primer pedido incorrecto'; end if;
    select * into r from public.solicitar_arrepentimiento_vita_plus(current_setting('app.a')::uuid);
    if r.vp_nueva then raise exception 'FAIL: el segundo pedido figura como nuevo'; end if;
    raise notice 'PASS: arrepentimiento registrado una sola vez';

    update public.vita_plus_pagos set creado_at = now() - interval '11 days' where suscripcion_id = v_id;
    delete from public.vita_plus_arrepentimientos where suscripcion_id = v_id;
    begin
      perform public.solicitar_arrepentimiento_vita_plus(current_setting('app.a')::uuid);
      raise exception 'FAIL: permitió arrepentirse pasados 10 días';
    exception when sqlstate '54000' then
      raise notice 'PASS: pasados 10 días no corresponde';
    end;
  end $$;
rollback;
