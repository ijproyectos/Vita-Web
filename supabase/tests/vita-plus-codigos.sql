-- Códigos de vita+ y segundo factor del panel — tests para la migración 046.
--
-- Script psql a mano: cada sección es una transacción con ROLLBACK (no persiste nada). Un run limpio imprime un
-- `NOTICE: PASS: ...` por aserción y falla con `FAIL: ...` ante cualquier desvío. No asume tablas vacías: todo se
-- crea dentro de la transacción con códigos/emails propios. Requisitos: migraciones 044, 045 y 046 aplicadas y dos
-- cuentas reales (user_a, user_b).
--
-- Run:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -v user_b="'<uuid>'" -f supabase/tests/vita-plus-codigos.sql

\set ON_ERROR_STOP on

-- 1 — plus: canje una vez por usuario, suma 15 días, origen codigo_plus
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_vigencia where usuario_id in (:user_a, :user_b);
  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    v_id uuid;
    r record;
    v_vence timestamptz;
  begin
    select cr_id into v_id from public.crear_codigo_vita_plus('plus', 2, null, repeat('a', 64), 'AAAA', 'test@example.com');
    if v_id is null then raise exception 'FAIL: no creó el código plus'; end if;
    raise notice 'PASS: crear_codigo_vita_plus crea un plus';

    select * into r from public.canjear_codigo_vita_plus(v_a, repeat('a', 64));
    if r.cj_resultado <> 'ok' or r.cj_permanente then raise exception 'FAIL: canje plus %', r.cj_resultado; end if;
    if r.cj_vence_at < now() + interval '14 days 23 hours' or r.cj_vence_at > now() + interval '15 days 1 hour' then
      raise exception 'FAIL: el plus no suma 15 días (%)', r.cj_vence_at;
    end if;
    v_vence := r.cj_vence_at;
    if (select origen from public.vita_plus_vigencia where usuario_id = v_a) <> 'codigo_plus' then
      raise exception 'FAIL: origen distinto de codigo_plus';
    end if;
    raise notice 'PASS: plus da 15 días y origen codigo_plus';

    select * into r from public.canjear_codigo_vita_plus(v_a, repeat('a', 64));
    if r.cj_resultado <> 'ya_canjeado' then raise exception 'FAIL: permitió canjear dos veces (%)', r.cj_resultado; end if;
    if (select usos from public.vita_plus_codigos where id = v_id) <> 1 then raise exception 'FAIL: contó dos usos'; end if;
    raise notice 'PASS: un solo canje por usuario y código';
  end;
  $$;
rollback;

-- 2 — usos_max se respeta, hash desconocido es invalido
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.vita_plus_vigencia where usuario_id in (:user_a, :user_b);
  do $$
  declare
    r record;
  begin
    perform public.crear_codigo_vita_plus('plus', 1, null, repeat('b', 64), 'BBBB', 'test@example.com');
    select * into r from public.canjear_codigo_vita_plus(current_setting('app.a')::uuid, repeat('b', 64));
    if r.cj_resultado <> 'ok' then raise exception 'FAIL: primer canje %', r.cj_resultado; end if;
    select * into r from public.canjear_codigo_vita_plus(current_setting('app.b')::uuid, repeat('b', 64));
    if r.cj_resultado <> 'agotado' then raise exception 'FAIL: superó usos_max (%)', r.cj_resultado; end if;
    raise notice 'PASS: usos_max se respeta';

    select * into r from public.canjear_codigo_vita_plus(current_setting('app.b')::uuid, repeat('f', 64));
    if r.cj_resultado <> 'invalido' then raise exception 'FAIL: hash desconocido (%)', r.cj_resultado; end if;
    raise notice 'PASS: hash desconocido = invalido';
  end;
  $$;
rollback;

-- 3 — revocado y vencido se rechazan; el vencimiento pasado no se puede crear
begin;
  select set_config('app.a', (:user_a)::text, true);
  delete from public.vita_plus_vigencia where usuario_id = :user_a;
  do $$
  declare
    v_id uuid;
    r record;
    c record;
  begin
    select cr_id into v_id from public.crear_codigo_vita_plus('plus', 5, null, repeat('c', 64), 'CCCC', 'test@example.com');
    if not public.revocar_codigo_vita_plus(v_id) then raise exception 'FAIL: no revocó'; end if;
    if public.revocar_codigo_vita_plus(v_id) then raise exception 'FAIL: revocó dos veces'; end if;
    select * into r from public.canjear_codigo_vita_plus(current_setting('app.a')::uuid, repeat('c', 64));
    if r.cj_resultado <> 'revocado' then raise exception 'FAIL: canjeó uno revocado (%)', r.cj_resultado; end if;
    raise notice 'PASS: revocado se rechaza';

    select * into c from public.crear_codigo_vita_plus('plus', 5, now() - interval '1 day', repeat('d', 64), 'DDDD', 'test@example.com');
    if c.cr_resultado <> 'vencimiento_pasado' then raise exception 'FAIL: aceptó un vencimiento pasado (%)', c.cr_resultado; end if;
    select cr_id into v_id from public.crear_codigo_vita_plus('plus', 5, now() + interval '1 hour', repeat('d', 64), 'DDDD', 'test@example.com');
    update public.vita_plus_codigos set vence_codigo_at = now() - interval '1 minute' where id = v_id;
    select * into r from public.canjear_codigo_vita_plus(current_setting('app.a')::uuid, repeat('d', 64));
    if r.cj_resultado <> 'vencido' then raise exception 'FAIL: canjeó uno vencido (%)', r.cj_resultado; end if;
    raise notice 'PASS: vencido se rechaza';

    select * into c from public.crear_codigo_vita_plus('plus', 5, null, repeat('d', 64), 'DDDD', 'test@example.com');
    if c.cr_resultado <> 'duplicado' then raise exception 'FAIL: aceptó un hash repetido (%)', c.cr_resultado; end if;
    select * into c from public.crear_codigo_vita_plus('otro', 5, null, repeat('e', 64), 'EEEE', 'test@example.com');
    if c.cr_resultado <> 'invalido' then raise exception 'FAIL: aceptó un tipo inválido'; end if;
    raise notice 'PASS: duplicado y tipo inválido se rechazan';
  end;
  $$;
rollback;

-- 4 — admin: permanente; un pago posterior NO borra permanente ni el origen; un plus posterior no lo consume
begin;
  select set_config('app.a', (:user_a)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  delete from public.vita_plus_vigencia where usuario_id = :user_a;
  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    r record;
  begin
    perform public.crear_codigo_vita_plus('admin', 3, null, repeat('1', 64), '1111', 'test@example.com');
    select * into r from public.canjear_codigo_vita_plus(v_a, repeat('1', 64));
    if r.cj_resultado <> 'ok' or not r.cj_permanente then raise exception 'FAIL: admin no quedó permanente (%)', r.cj_resultado; end if;
    if not (select permanente and origen = 'codigo_admin' from public.vita_plus_vigencia where usuario_id = v_a) then
      raise exception 'FAIL: la fila de vigencia no quedó permanente/codigo_admin';
    end if;
    raise notice 'PASS: admin deja vita+ permanente';
  end;
  $$;

  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    v_sub uuid;
    r record;
  begin
    v_sub := public.iniciar_suscripcion_vita_plus(v_a, 'ref-codigos-0000000000000001', 'mensual', 1, 499, 1560, 7784);
    perform public.registrar_pago_vita_plus(v_a, 'pago-codigos-test-1', v_sub, 7784);
    if not (select permanente and origen = 'codigo_admin' from public.vita_plus_vigencia where usuario_id = v_a) then
      raise exception 'FAIL: un pago borró permanente u origen';
    end if;
    raise notice 'PASS: un pago posterior no borra permanente';

    perform public.crear_codigo_vita_plus('plus', 3, null, repeat('2', 64), '2222', 'test@example.com');
    select * into r from public.canjear_codigo_vita_plus(v_a, repeat('2', 64));
    if r.cj_resultado <> 'ya_permanente' then raise exception 'FAIL: plus sobre permanente (%)', r.cj_resultado; end if;
    if (select usos from public.vita_plus_codigos where codigo_hash = repeat('2', 64)) <> 0 then
      raise exception 'FAIL: consumió un uso';
    end if;
    raise notice 'PASS: un plus sobre una cuenta permanente no consume el código';
  end;
  $$;
rollback;

-- 5 — plus sobre un pago vigente suma desde el vencimiento; el pago pisa origen si no es permanente
begin;
  select set_config('app.a', (:user_a)::text, true);
  delete from public.vita_plus_suscripciones where usuario_id = :user_a;
  delete from public.vita_plus_vigencia where usuario_id = :user_a;
  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    v_sub uuid;
    v_antes timestamptz;
    r record;
  begin
    v_sub := public.iniciar_suscripcion_vita_plus(v_a, 'ref-codigos-0000000000000002', 'mensual', 1, 499, 1560, 7784);
    v_antes := public.registrar_pago_vita_plus(v_a, 'pago-codigos-test-2', v_sub, 7784);
    if (select origen from public.vita_plus_vigencia where usuario_id = v_a) <> 'pago' then raise exception 'FAIL: origen del pago'; end if;
    perform public.crear_codigo_vita_plus('plus', 3, null, repeat('3', 64), '3333', 'test@example.com');
    select * into r from public.canjear_codigo_vita_plus(v_a, repeat('3', 64));
    if r.cj_vence_at < v_antes + interval '14 days 23 hours' then raise exception 'FAIL: no sumó sobre el vencimiento vigente'; end if;
    raise notice 'PASS: plus suma 15 días sobre una vigencia pagada';
  end;
  $$;
rollback;

-- 6 — segundo factor del panel: intentos, un solo uso, vencimiento
begin;
  select set_config('app.a', (:user_a)::text, true);
  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    v_email text := 'panel-test@example.com';
    v_res text;
    i int;
  begin
    insert into public.admin_codigos_verificacion (usuario_id, admin_email, codigo_hash, vence_at)
    values (v_a, v_email, repeat('9', 64), now() + interval '10 minutes');

    if public.verificar_codigo_admin(v_email, repeat('0', 64)) <> 'incorrecto' then raise exception 'FAIL: 1er intento errado'; end if;
    if public.verificar_codigo_admin(v_email, repeat('9', 64)) <> 'ok' then raise exception 'FAIL: código correcto'; end if;
    if public.verificar_codigo_admin(v_email, repeat('9', 64)) <> 'sin_codigo' then raise exception 'FAIL: reutilizó un código'; end if;
    raise notice 'PASS: un código correcto sirve una sola vez';

    insert into public.admin_codigos_verificacion (usuario_id, admin_email, codigo_hash, vence_at)
    values (v_a, v_email, repeat('8', 64), now() + interval '10 minutes');
    for i in 1..4 loop
      v_res := public.verificar_codigo_admin(v_email, repeat('0', 64));
      if v_res <> 'incorrecto' then raise exception 'FAIL: intento % dio %', i, v_res; end if;
    end loop;
    if public.verificar_codigo_admin(v_email, repeat('0', 64)) <> 'agotado' then raise exception 'FAIL: 5to error no agota'; end if;
    if public.verificar_codigo_admin(v_email, repeat('8', 64)) <> 'agotado' then raise exception 'FAIL: aceptó el correcto tras agotar'; end if;
    raise notice 'PASS: 5 intentos agotan el código aunque después acierte';

    insert into public.admin_codigos_verificacion (usuario_id, admin_email, codigo_hash, vence_at, created_at)
    values (v_a, v_email, repeat('7', 64), now() - interval '1 minute', now() + interval '1 second');
    if public.verificar_codigo_admin(v_email, repeat('7', 64)) <> 'vencido' then raise exception 'FAIL: aceptó uno vencido'; end if;
    raise notice 'PASS: un código vencido se rechaza';
  end;
  $$;
rollback;

-- 7 — anon / authenticated no pueden ejecutar las RPC ni leer las tablas
begin;
  do $$
  declare
    f text;
    rol text;
  begin
    foreach rol in array array['anon', 'authenticated'] loop
      foreach f in array array[
        'public.canjear_codigo_vita_plus(uuid, text)',
        'public.crear_codigo_vita_plus(text, int, timestamptz, text, text, text)',
        'public.revocar_codigo_vita_plus(uuid)',
        'public.verificar_codigo_admin(text, text)'
      ] loop
        if has_function_privilege(rol, f, 'execute') then
          raise exception 'FAIL: % puede ejecutar %', rol, f;
        end if;
      end loop;
      foreach f in array array['public.vita_plus_codigos', 'public.vita_plus_canjes', 'public.admin_codigos_verificacion', 'public.admin_acciones'] loop
        if has_table_privilege(rol, f, 'select') or has_table_privilege(rol, f, 'insert') then
          raise exception 'FAIL: % tiene acceso directo a %', rol, f;
        end if;
      end loop;
    end loop;
    if not has_function_privilege('service_role', 'public.canjear_codigo_vita_plus(uuid, text)', 'execute') then
      raise exception 'FAIL: service_role no puede ejecutar el canje';
    end if;
    raise notice 'PASS: anon y authenticated no ejecutan las RPC ni tocan las tablas; service_role sí';
  end;
  $$;
rollback;

-- 8 — RLS activada sin policies en las cuatro tablas nuevas
begin;
  do $$
  declare
    t text;
  begin
    foreach t in array array['vita_plus_codigos', 'vita_plus_canjes', 'admin_codigos_verificacion', 'admin_acciones'] loop
      if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
        raise exception 'FAIL: % sin RLS', t;
      end if;
      if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
        raise exception 'FAIL: % tiene policies', t;
      end if;
    end loop;
    raise notice 'PASS: RLS activada y sin policies en las tablas de códigos y panel';
  end;
  $$;
rollback;
