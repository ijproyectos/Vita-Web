-- Límite de interacciones con vita — tests para la migración 049.
--
-- Script psql a mano: cada sección es una transacción con ROLLBACK. Un run limpio imprime un
-- `NOTICE: PASS: ...` por aserción. Requisitos: migración 049 aplicada y una cuenta real (user_a).
-- No asume tablas vacías: usa fechas lejanas (2099) y borra/restaura solo dentro de la transacción.
--
-- Run:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -f supabase/tests/limite-interacciones.sql

\set ON_ERROR_STOP on

-- 1 — consumir_interaccion suma de a uno, respeta el límite general y no pasa del tope
begin;
  select set_config('t.u', :user_a, true);
  do $$
  declare r record; u uuid := current_setting('t.u')::uuid;
  begin
    delete from public.limites_interacciones where usuario_id = u;
    delete from public.interacciones_diarias where usuario_id = u and fecha = '2099-01-01';

    select * into r from public.consumir_interaccion(u, '2099-01-01', 3);
    if not (r.c_permitido and r.c_usadas = 1 and r.c_limite = 3) then raise exception 'FAIL: primera (% % %)', r.c_permitido, r.c_usadas, r.c_limite; end if;
    perform public.consumir_interaccion(u, '2099-01-01', 3);
    select * into r from public.consumir_interaccion(u, '2099-01-01', 3);
    if not (r.c_permitido and r.c_usadas = 3) then raise exception 'FAIL: tercera (% %)', r.c_permitido, r.c_usadas; end if;
    select * into r from public.consumir_interaccion(u, '2099-01-01', 3);
    if r.c_permitido or r.c_usadas <> 3 then raise exception 'FAIL: la cuarta no se bloquea o pasa del tope (% %)', r.c_permitido, r.c_usadas; end if;
    select * into r from public.consumir_interaccion(u, '2099-01-01', 3);
    if r.c_permitido or r.c_usadas <> 3 then raise exception 'FAIL: el contador pasó del tope (%)', r.c_usadas; end if;
    raise notice 'PASS: incremento atómico y tope en el límite general';
  end $$;
rollback;

-- 2 — El override de la persona manda sobre el límite general (sube y baja)
begin;
  select set_config('t.u', :user_a, true);
  do $$
  declare r record; u uuid := current_setting('t.u')::uuid;
  begin
    delete from public.limites_interacciones where usuario_id = u;
    delete from public.interacciones_diarias where usuario_id = u and fecha = '2099-01-02';

    select * into r from public.admin_definir_limite_interacciones(u, 1, 'test@example.com', 'bajar');
    if r.d_resultado <> 'ok' then raise exception 'FAIL: definir (%)', r.d_resultado; end if;
    perform public.consumir_interaccion(u, '2099-01-02', 15);
    select * into r from public.consumir_interaccion(u, '2099-01-02', 15);
    if r.c_permitido or r.c_limite <> 1 then raise exception 'FAIL: el override bajo no se respeta (% %)', r.c_permitido, r.c_limite; end if;

    select * into r from public.admin_definir_limite_interacciones(u, 40, 'test@example.com', 'subir');
    if r.d_anterior <> 1 then raise exception 'FAIL: anterior (%)', r.d_anterior; end if;
    select * into r from public.consumir_interaccion(u, '2099-01-02', 15);
    if not r.c_permitido or r.c_limite <> 40 then raise exception 'FAIL: el override alto no se respeta (% %)', r.c_permitido, r.c_limite; end if;

    select * into r from public.admin_definir_limite_interacciones(u, null, 'test@example.com', '');
    select * into r from public.interacciones_hoy(u, '2099-01-02', 15);
    if r.h_limite <> 15 then raise exception 'FAIL: volver al general (%)', r.h_limite; end if;
    raise notice 'PASS: override por persona y vuelta al límite general';
  end $$;
rollback;

-- 3 — Validación: límite fuera de 1..1000 y motivo largo se rechazan; el CHECK de la tabla también
begin;
  select set_config('t.u', :user_a, true);
  do $$
  declare r record; u uuid := current_setting('t.u')::uuid;
  begin
    select * into r from public.admin_definir_limite_interacciones(u, 0, 'test@example.com', '');
    if r.d_resultado <> 'invalido' then raise exception 'FAIL: 0 aceptado'; end if;
    select * into r from public.admin_definir_limite_interacciones(u, 1001, 'test@example.com', '');
    if r.d_resultado <> 'invalido' then raise exception 'FAIL: 1001 aceptado'; end if;
    select * into r from public.admin_definir_limite_interacciones(u, 10, 'test@example.com', repeat('x', 201));
    if r.d_resultado <> 'invalido' then raise exception 'FAIL: motivo largo aceptado'; end if;
    begin
      insert into public.limites_interacciones (usuario_id, limite_diario, definido_por) values (u, 5000, 'test@example.com');
      raise exception 'FAIL: el CHECK permitió 5000';
    exception when check_violation then
      raise notice 'PASS: validaciones de rango y motivo';
    end;
  end $$;
rollback;

-- 4 — Días distintos cuentan por separado (reseteo a medianoche AR = otra fecha)
begin;
  select set_config('t.u', :user_a, true);
  do $$
  declare r record; u uuid := current_setting('t.u')::uuid;
  begin
    delete from public.limites_interacciones where usuario_id = u;
    delete from public.interacciones_diarias where usuario_id = u and fecha in ('2099-02-01', '2099-02-02');
    perform public.consumir_interaccion(u, '2099-02-01', 1);
    select * into r from public.consumir_interaccion(u, '2099-02-01', 1);
    if r.c_permitido then raise exception 'FAIL: el día 1 no se bloquea'; end if;
    select * into r from public.consumir_interaccion(u, '2099-02-02', 1);
    if not r.c_permitido or r.c_usadas <> 1 then raise exception 'FAIL: el día 2 no arranca de cero (% %)', r.c_permitido, r.c_usadas; end if;
    raise notice 'PASS: separación por día';
  end $$;
rollback;

-- 5 — admin_interacciones y admin_usuarios_en_limite
begin;
  select set_config('t.u', :user_a, true);
  do $$
  declare r record; n_antes int; n_despues int; u uuid := current_setting('t.u')::uuid;
  begin
    delete from public.limites_interacciones where usuario_id = u;
    delete from public.interacciones_diarias where usuario_id = u and fecha = '2099-03-01';
    n_antes := public.admin_usuarios_en_limite('2099-03-01', 2);
    perform public.consumir_interaccion(u, '2099-03-01', 2);
    perform public.consumir_interaccion(u, '2099-03-01', 2);
    n_despues := public.admin_usuarios_en_limite('2099-03-01', 2);
    if n_despues <> n_antes + 1 then raise exception 'FAIL: usuarios en límite (% -> %)', n_antes, n_despues; end if;
    select * into r from public.admin_interacciones(array[u], '2099-03-01', 2);
    if r.a_usadas <> 2 or r.a_limite <> 2 or r.a_personalizado then raise exception 'FAIL: admin_interacciones (% % %)', r.a_usadas, r.a_limite, r.a_personalizado; end if;
    raise notice 'PASS: lecturas del panel';
  end $$;
rollback;

-- 6 — anon y authenticated no ven las tablas ni ejecutan las funciones (solo service_role)
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    begin
      perform public.consumir_interaccion(gen_random_uuid(), '2099-04-01', 15);
      raise exception 'FAIL: authenticated ejecutó consumir_interaccion';
    exception when insufficient_privilege then
      raise notice 'PASS: consumir_interaccion no es ejecutable por authenticated';
    end;
    begin
      perform public.admin_definir_limite_interacciones(gen_random_uuid(), 5, 'x@example.com', '');
      raise exception 'FAIL: authenticated ejecutó admin_definir_limite_interacciones';
    exception when insufficient_privilege then
      raise notice 'PASS: admin_definir_limite_interacciones no es ejecutable por authenticated';
    end;
    begin
      select count(*) into n from public.interacciones_diarias;
      raise exception 'FAIL: authenticated lee interacciones_diarias';
    exception when insufficient_privilege then
      raise notice 'PASS: interacciones_diarias sin acceso para authenticated';
    end;
    begin
      select count(*) into n from public.limites_interacciones;
      raise exception 'FAIL: authenticated lee limites_interacciones';
    exception when insufficient_privilege then
      raise notice 'PASS: limites_interacciones sin acceso para authenticated';
    end;
  end $$;
rollback;

begin;
  set local role anon;
  do $$
  begin
    begin
      perform public.interacciones_hoy(gen_random_uuid(), '2099-04-01', 15);
      raise exception 'FAIL: anon ejecutó interacciones_hoy';
    exception when insufficient_privilege then
      raise notice 'PASS: anon sin acceso a las funciones';
    end;
  end $$;
rollback;
