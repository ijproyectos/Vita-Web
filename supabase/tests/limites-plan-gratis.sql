-- Límites del plan gratis — tests para la migración 061.
--
-- Script psql a mano: cada sección es una transacción con ROLLBACK (no quedan filas de prueba; los vínculos y la
-- vigencia vita+ de estas cuentas se borran DENTRO de la transacción y vuelven con el rollback). Un run limpio
-- imprime un `NOTICE: PASS: ...` por aserción.
--
-- Requisitos:
--   1. Migraciones hasta 061 aplicadas (en un entorno de prueba: este test NO se corre contra producción sin revisar).
--   2. Tres cuentas REALES de auth.users: elder_id (E, la persona), cuidador_id (C1) y otro_id (C2).
--   3. Conectar como el rol `postgres` del pooler (bypasea RLS para los fixtures).
--
-- Run:
--   psql "<pooler connection string>" -v elder_id="'<uuid>'" -v cuidador_id="'<uuid>'" -v otro_id="'<uuid>'" \
--     -f supabase/tests/limites-plan-gratis.sql

\set ON_ERROR_STOP on

-- 1 — es_vita_plus_de: la propia persona o un Admin aceptado con vita+; 'ver', pendiente, vencido => no
begin;
  select set_config('t.e', :elder_id, true), set_config('t.c1', :cuidador_id, true);
  do $$
  declare e uuid := current_setting('t.e')::uuid; c1 uuid := current_setting('t.c1')::uuid;
  begin
    delete from public.vinculos_cuidador where elder_id = e;
    delete from public.vita_plus_vigencia where usuario_id in (e, c1);

    if public.es_vita_plus_de(e) then raise exception 'FAIL: gratis figura como vita+'; end if;

    insert into public.vita_plus_vigencia (usuario_id, vence_at, permanente) values (e, now() + interval '5 days', false);
    if not public.es_vita_plus_de(e) then raise exception 'FAIL: vita+ propio no cuenta'; end if;
    update public.vita_plus_vigencia set vence_at = now() - interval '1 day' where usuario_id = e;
    if public.es_vita_plus_de(e) then raise exception 'FAIL: vita+ vencido cuenta'; end if;
    update public.vita_plus_vigencia set permanente = true where usuario_id = e;
    if not public.es_vita_plus_de(e) then raise exception 'FAIL: vita+ permanente no cuenta'; end if;
    delete from public.vita_plus_vigencia where usuario_id = e;
    raise notice 'PASS: es_vita_plus_de con vita+ propio, vencido y permanente';

    insert into public.vita_plus_vigencia (usuario_id, vence_at, permanente) values (c1, now() + interval '5 days', false);
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, rol)
      values (e, c1, '', 'pendiente', 'editar');
    if public.es_vita_plus_de(e) then raise exception 'FAIL: un Admin pendiente cubre a la persona'; end if;
    update public.vinculos_cuidador set estado = 'aceptado', rol = 'ver' where elder_id = e and cuidador_id = c1;
    if public.es_vita_plus_de(e) then raise exception 'FAIL: un Lector con vita+ cubre a la persona'; end if;
    update public.vinculos_cuidador set rol = 'editar' where elder_id = e and cuidador_id = c1;
    if not public.es_vita_plus_de(e) then raise exception 'FAIL: un Admin aceptado con vita+ no cubre a la persona'; end if;
    raise notice 'PASS: un Admin aceptado con vita+ cubre a la persona; pendiente y Lector no';
  end $$;
rollback;

-- 2 — Trigger: un solo cuidador en gratis; vita+ sin tope; lo existente se conserva
begin;
  select set_config('t.e', :elder_id, true), set_config('t.c1', :cuidador_id, true), set_config('t.c2', :otro_id, true);
  do $$
  declare
    e uuid := current_setting('t.e')::uuid;
    c1 uuid := current_setting('t.c1')::uuid;
    c2 uuid := current_setting('t.c2')::uuid;
    bloqueado boolean;
    v_id uuid;
  begin
    delete from public.vinculos_cuidador where elder_id = e;
    delete from public.vita_plus_vigencia where usuario_id in (e, c1, c2);

    -- el primero entra
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
      values (e, c1, '', 'aceptado', now(), 'ver');
    -- el segundo (invitación pendiente por mail) no
    bloqueado := false;
    begin
      insert into public.vinculos_cuidador (elder_id, email_invitado, estado) values (e, 'otra@example.com', 'pendiente');
    exception when others then
      bloqueado := sqlerrm = 'limite_cuidadores';
    end;
    if not bloqueado then raise exception 'FAIL: el segundo cuidador no se bloquea'; end if;
    raise notice 'PASS: el segundo cuidador (invitación) se bloquea en gratis';

    -- un vínculo revocado no cuenta ni se bloquea
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, rol)
      values (e, c2, '', 'revocado', 'ver') returning id into v_id;
    raise notice 'PASS: un vínculo revocado no cuenta';

    -- reactivar el revocado cuenta como alta nueva: se bloquea
    bloqueado := false;
    begin
      update public.vinculos_cuidador set estado = 'aceptado' where id = v_id;
    exception when others then
      bloqueado := sqlerrm = 'limite_cuidadores';
    end;
    if not bloqueado then raise exception 'FAIL: reactivar un revocado salta el tope'; end if;
    raise notice 'PASS: reactivar un vínculo revocado se bloquea';

    -- reclamar un código iniciado por un cuidador (elder_id null -> persona) también se bloquea
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, codigo, expira_at)
      values (null, c2, '', 'pendiente', '999001', now() + interval '30 minutes') returning id into v_id;
    bloqueado := false;
    begin
      update public.vinculos_cuidador set elder_id = e, estado = 'aceptado' where id = v_id;
    exception when others then
      bloqueado := sqlerrm = 'limite_cuidadores';
    end;
    if not bloqueado then raise exception 'FAIL: reclamar un código salta el tope'; end if;
    raise notice 'PASS: reclamar un código de vínculo se bloquea';

    -- una invitación pendiente VENCIDA no ocupa el lugar
    delete from public.vinculos_cuidador where elder_id = e;
    insert into public.vinculos_cuidador (elder_id, email_invitado, estado, expira_at)
      values (e, 'vieja@example.com', 'pendiente', now() - interval '1 day');
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
      values (e, c1, '', 'aceptado', now(), 'ver');
    raise notice 'PASS: una invitación vencida no cuenta';

    -- revivir una invitación vencida (como hace invitar_cuidador) con el cupo ya ocupado: se bloquea
    update public.vinculos_cuidador set expira_at = now() - interval '1 hour'
      where elder_id = e and estado = 'pendiente' and email_invitado = 'vieja@example.com';
    bloqueado := false;
    begin
      update public.vinculos_cuidador set expira_at = now() + interval '7 days', token = 'nuevo-token-revivido'
        where elder_id = e and estado = 'pendiente' and email_invitado = 'vieja@example.com';
    exception when others then
      bloqueado := sqlerrm = 'limite_cuidadores';
    end;
    if not bloqueado then raise exception 'FAIL: revivir una invitación vencida salta el tope'; end if;
    raise notice 'PASS: revivir una invitación pendiente vencida se bloquea';

    -- con vita+ de la persona no hay tope, y si después lo pierde conserva a todos (no se quita a nadie)
    delete from public.vinculos_cuidador where elder_id = e;
    insert into public.vita_plus_vigencia (usuario_id, vence_at, permanente) values (e, now() + interval '5 days', false);
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
      values (e, c1, '', 'aceptado', now(), 'ver');
    insert into public.vinculos_cuidador (elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
      values (e, c2, '', 'aceptado', now(), 'ver');
    delete from public.vita_plus_vigencia where usuario_id = e;
    update public.vinculos_cuidador set relacion = 'Hijo' where elder_id = e and cuidador_id = c1;
    update public.vinculos_cuidador set rol = 'editar' where elder_id = e and cuidador_id = c2;
    if (select count(*) from public.vinculos_cuidador where elder_id = e and estado = 'aceptado') <> 2 then
      raise exception 'FAIL: se perdieron cuidadores existentes';
    end if;
    bloqueado := false;
    begin
      insert into public.vinculos_cuidador (elder_id, email_invitado, estado) values (e, 'tercera@example.com', 'pendiente');
    exception when others then
      bloqueado := sqlerrm = 'limite_cuidadores';
    end;
    if not bloqueado then raise exception 'FAIL: con 2 cuidadores y sin vita+ se puede sumar un tercero'; end if;
    raise notice 'PASS: con vita+ no hay tope; quien ya tenía más de uno los conserva y no suma otro';

    -- el vita+ de un Admin aceptado habilita sumar a la persona
    insert into public.vita_plus_vigencia (usuario_id, vence_at, permanente) values (c2, now() + interval '5 days', false);
    insert into public.vinculos_cuidador (elder_id, email_invitado, estado) values (e, 'cuarta@example.com', 'pendiente');
    raise notice 'PASS: el vita+ de un Admin aceptado levanta el tope de la persona';
  end $$;
rollback;

-- 3 — RPC invitar_cuidador como la persona (authenticated): el segundo invitado falla con limite_cuidadores
begin;
  select set_config('t.e', :elder_id, true);
  delete from public.vinculos_cuidador where elder_id = :elder_id;
  delete from public.vita_plus_vigencia where usuario_id = :elder_id;
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare e uuid := current_setting('t.e')::uuid; bloqueado boolean := false; r record;
  begin
    perform * from public.invitar_cuidador(e, 'uno@example.com', 'Uno', 'Hijo', 'ver');
    select * into r from public.cupo_cuidadores(e);
    if r.c_plus or r.c_usados <> 1 then raise exception 'FAIL: cupo_cuidadores (% %)', r.c_plus, r.c_usados; end if;
    begin
      perform * from public.invitar_cuidador(e, 'dos@example.com', 'Dos', 'Hija', 'ver');
    exception when others then
      bloqueado := sqlerrm like '%limite_cuidadores%';
    end;
    if not bloqueado then raise exception 'FAIL: invitar_cuidador deja pasar al segundo'; end if;
    raise notice 'PASS: invitar_cuidador bloquea al segundo y cupo_cuidadores informa 1 usado';

    -- reemitir la invitación al MISMO mail no es un alta nueva
    perform * from public.invitar_cuidador(e, 'uno@example.com', 'Uno', 'Hijo', 'ver');
    raise notice 'PASS: reenviar la invitación al mismo mail sigue andando';
  end $$;
rollback;

-- 4 — Usos de funciones: solo la persona o un Admin; cuenta el mes en curso
begin;
  select set_config('t.e', :elder_id, true), set_config('t.c2', :otro_id, true);
  delete from public.usos_funciones where usuario_id = :elder_id;
  select set_config('request.jwt.claim.sub', (:elder_id)::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', :elder_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare e uuid := current_setting('t.e')::uuid; o uuid := current_setting('t.c2')::uuid; r record;
  begin
    if public.usos_funcion_mes(e, 'contar_pastillas') <> 0 then raise exception 'FAIL: arranca distinto de 0'; end if;
    select * into r from public.consumir_uso_funcion(e, 'contar_pastillas', 1);
    if not r.c_permitido or r.c_usados <> 1 or r.c_id is null then raise exception 'FAIL: no registra el uso propio'; end if;
    if public.usos_funcion_mes(e, 'contar_pastillas') <> 1 then raise exception 'FAIL: no cuenta el uso'; end if;
    -- tope alcanzado: no registra
    select * into r from public.consumir_uso_funcion(e, 'contar_pastillas', 1);
    if r.c_permitido or r.c_id is not null or public.usos_funcion_mes(e, 'contar_pastillas') <> 1 then
      raise exception 'FAIL: pasa el tope de 1 por mes';
    end if;
    -- devolver: libera el cupo (solo quien lo registró)
    select * into r from public.consumir_uso_funcion(e, 'analizar_estudio', 1);
    if not r.c_permitido then raise exception 'FAIL: no registra el análisis'; end if;
    if not public.devolver_uso_funcion(r.c_id) then raise exception 'FAIL: no devuelve el uso'; end if;
    if public.devolver_uso_funcion(r.c_id) then raise exception 'FAIL: devuelve dos veces'; end if;
    select * into r from public.consumir_uso_funcion(e, 'analizar_estudio', 1);
    if not r.c_permitido then raise exception 'FAIL: tras devolver no hay cupo'; end if;
    if (select count(*) from public.usos_funciones where usuario_id = e and funcion = 'analizar_estudio') <> 1 then
      raise exception 'FAIL: borrar el estudio no debe tocar usos_funciones (hay 1 uso)';
    end if;
    if (select c_permitido from public.consumir_uso_funcion(e, 'otra_cosa', 1)) then raise exception 'FAIL: acepta una función inválida'; end if;
    -- sobre otra persona sin vínculo: sin permiso
    if (select c_permitido from public.consumir_uso_funcion(o, 'contar_pastillas', 1)) then raise exception 'FAIL: registra sobre una persona ajena'; end if;
    if public.usos_funcion_mes(o, 'contar_pastillas') is not null then raise exception 'FAIL: cuenta usos de una persona ajena'; end if;
    raise notice 'PASS: consumir_uso_funcion / devolver_uso_funcion / usos_funcion_mes respetan tope y quién pregunta';
  end $$;
  reset role;
  do $$
  declare e uuid := current_setting('t.e')::uuid;
  begin
    -- un uso del mes pasado no cuenta
    insert into public.usos_funciones (usuario_id, funcion, created_at) values (e, 'contar_pastillas', public._inicio_mes_ar() - interval '1 minute');
    if (select count(*) from public.usos_funciones u where u.usuario_id = e and u.funcion = 'contar_pastillas' and u.created_at >= public._inicio_mes_ar()) <> 1 then
      raise exception 'FAIL: el borde del mes (AR) no separa los usos';
    end if;
    raise notice 'PASS: el mes calendario (AR) separa los usos';
  end $$;
rollback;

-- 5 — Chat: tope extra para gratis (min) y sin tope para vita+
begin;
  select set_config('t.u', :elder_id, true);
  do $$
  declare r record; u uuid := current_setting('t.u')::uuid; i int;
  begin
    delete from public.limites_interacciones where usuario_id = u;
    delete from public.interacciones_diarias where usuario_id = u and fecha = '2099-02-01';

    for i in 1..5 loop
      select * into r from public.consumir_interaccion(u, '2099-02-01', 15, 5);
      if not r.c_permitido or r.c_limite <> 5 then raise exception 'FAIL: consulta % (% %)', i, r.c_permitido, r.c_limite; end if;
    end loop;
    select * into r from public.consumir_interaccion(u, '2099-02-01', 15, 5);
    if r.c_permitido or r.c_usadas <> 5 then raise exception 'FAIL: la sexta no se bloquea (% %)', r.c_permitido, r.c_usadas; end if;
    select * into r from public.consumir_interaccion(u, '2099-02-01', 15, null);
    if not r.c_permitido or r.c_limite <> 15 then raise exception 'FAIL: sin tope (vita+) no rige el límite general (% %)', r.c_permitido, r.c_limite; end if;
    raise notice 'PASS: gratis tope 5; vita+ el límite configurado';

    perform public.admin_definir_limite_interacciones(u, 3, 'test@example.com', 'bajar');
    select * into r from public.interacciones_hoy(u, '2099-02-01', 15, 5);
    if r.h_limite <> 3 then raise exception 'FAIL: min(5, 3) (%)', r.h_limite; end if;
    perform public.admin_definir_limite_interacciones(u, 40, 'test@example.com', 'subir');
    select * into r from public.interacciones_hoy(u, '2099-02-01', 15, 5);
    if r.h_limite <> 5 then raise exception 'FAIL: min(5, 40) (%)', r.h_limite; end if;
    select * into r from public.interacciones_hoy(u, '2099-02-01', 15);
    if r.h_limite <> 40 then raise exception 'FAIL: vita+ con override 40 (%)', r.h_limite; end if;
    raise notice 'PASS: gratis = min(5, límite configurado)';
  end $$;
rollback;
