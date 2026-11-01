-- Gestión del panel /adminvita (administradores, suspensiones, envíos masivos) — tests de la migración 047.
--
-- Script psql a mano, mismo estilo que los demás: cada sección es su propia transacción y termina en ROLLBACK (no
-- persiste nada). Un run limpio imprime un `NOTICE: PASS: ...` por aserción y falla con `FAIL: ...` ante cualquier
-- desvío. No asume tablas vacías: todo se crea dentro de la transacción.
-- Requisitos: migraciones 017, 020, 035, 045, 046 y 047 aplicadas y dos cuentas reales (user_a, user_b).
--
-- Run:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -v user_b="'<uuid>'" -f supabase/tests/admin-gestion.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — anon y authenticated NO ejecutan las funciones admin; mi_suspension solo la ve authenticated
-- ===========================================================================
begin;
  create temp table _fn (firma text) on commit drop;
  insert into _fn values
    ('select public.admin_es_administrador(''x@example.com'')'),
    ('select public.admin_agregar_administrador(''x@example.com'', ''o@example.com'')'),
    ('select public.admin_revocar_administrador(''x@example.com'')'),
    ('select public.admin_suspender_usuario(gen_random_uuid(), ''mal_uso'', '''', ''o@example.com'')'),
    ('select public.admin_reactivar_usuario(gen_random_uuid(), ''o@example.com'')'),
    ('select * from public.admin_suspensiones_de(gen_random_uuid())'),
    ('select * from public.admin_destinatarios_masivos()'),
    ('select * from public.crear_envio_masivo(''t'', ''c'', ''/app'', ''o@example.com'')'),
    ('select * from public.reclamar_lote_envio_masivo(5)'),
    ('select public.registrar_progreso_envio_masivo(gen_random_uuid(), 1, 1, 0)'),
    ('select public.cancelar_envio_masivo(gen_random_uuid(), ''o@example.com'')'),
    ('select * from public.admin_usuarios(''x'', ''suspendidos'', 5, 0)');
  grant select on _fn to anon, authenticated;

  do $$
  declare
    r record;
    v_rol text;
    v_tabla text;
  begin
    foreach v_rol in array array['anon', 'authenticated'] loop
      for r in select firma from _fn loop
        execute format('set local role %I', v_rol);
        begin
          execute r.firma;
          reset role;
          raise exception 'FAIL: % pudo ejecutar %', v_rol, r.firma;
        exception when insufficient_privilege then
          reset role;
        end;
      end loop;
    end loop;
    raise notice 'PASS: anon y authenticated no pueden ejecutar las funciones admin';

    set local role anon;
    begin
      perform * from public.mi_suspension();
      reset role;
      raise exception 'FAIL: anon pudo ejecutar mi_suspension';
    exception when insufficient_privilege then
      reset role;
    end;
    raise notice 'PASS: anon no ejecuta mi_suspension';

    foreach v_rol in array array['anon', 'authenticated'] loop
      foreach v_tabla in array array['administradores', 'envios_masivos'] loop
        execute format('set local role %I', v_rol);
        begin
          execute format('select count(*) from public.%I', v_tabla);
          reset role;
          raise exception 'FAIL: % pudo leer %', v_rol, v_tabla;
        exception when insufficient_privilege then
          reset role;
        end;
      end loop;
    end loop;
    raise notice 'PASS: administradores y envios_masivos no se leen con anon/authenticated';
  end;
  $$;
rollback;

-- ===========================================================================
-- 2 — administradores: alta, duplicado, formato, revocación (mata el segundo factor), reactivación
-- ===========================================================================
begin;
  do $$
  declare
    v_antes timestamptz;
  begin
    delete from public.administradores where email like '%@test-gestion.example';
    delete from public.admin_2fa_revocaciones where admin_email like '%@test-gestion.example';

    if public.admin_es_administrador('bob@test-gestion.example') then raise exception 'FAIL: existía antes del alta'; end if;
    if public.admin_agregar_administrador('  Bob@Test-Gestion.example ', 'Dueno@Example.com') <> 'ok' then raise exception 'FAIL: no agregó'; end if;
    if not public.admin_es_administrador('BOB@test-gestion.example') then raise exception 'FAIL: no es administrador tras el alta (case)'; end if;
    if (select email from public.administradores where email like '%@test-gestion.example') <> 'bob@test-gestion.example' then
      raise exception 'FAIL: no normalizó a minúsculas';
    end if;
    raise notice 'PASS: alta normaliza y se reconoce sin importar mayúsculas';

    if public.admin_agregar_administrador('bob@test-gestion.example', 'otro@example.com') <> 'ya_activo' then raise exception 'FAIL: permitió duplicar'; end if;
    if public.admin_agregar_administrador('no-es-email', 'dueno@example.com') <> 'invalido' then raise exception 'FAIL: aceptó un email inválido'; end if;
    if public.admin_agregar_administrador('a b@x.com', 'dueno@example.com') <> 'invalido' then raise exception 'FAIL: aceptó espacios'; end if;
    if public.admin_agregar_administrador('x@y.com', '') <> 'invalido' then raise exception 'FAIL: aceptó sin quien agrega'; end if;
    raise notice 'PASS: duplicado y formato inválido se rechazan';

    v_antes := now();
    if not public.admin_revocar_administrador('bob@test-gestion.example') then raise exception 'FAIL: no revocó'; end if;
    if public.admin_es_administrador('bob@test-gestion.example') then raise exception 'FAIL: sigue activo tras revocar'; end if;
    if public.admin_revocar_administrador('bob@test-gestion.example') then raise exception 'FAIL: revocó dos veces'; end if;
    if public.admin_revocar_administrador('nadie@test-gestion.example') then raise exception 'FAIL: revocó a quien no existe'; end if;
    if not exists (select 1 from public.admin_2fa_revocaciones where admin_email = 'bob@test-gestion.example' and revocado_desde >= v_antes) then
      raise exception 'FAIL: la revocación no mató el segundo factor';
    end if;
    raise notice 'PASS: revocar desactiva y escribe admin_2fa_revocaciones';

    if public.admin_agregar_administrador('bob@test-gestion.example', 'dueno@example.com') <> 'ok' then raise exception 'FAIL: no reactivó'; end if;
    if not public.admin_es_administrador('bob@test-gestion.example') then raise exception 'FAIL: no quedó activo al volver a agregarlo'; end if;
    raise notice 'PASS: volver a agregar a un revocado lo reactiva';
  end;
  $$;
rollback;

-- ===========================================================================
-- 3 — suspensiones: alta, protegidos, visibilidad (la propia sí, ajena no, sin nota) y reactivación
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.suspensiones where usuario_id in (:user_a, :user_b);

  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    v_b uuid := current_setting('app.b')::uuid;
    v_email_a text;
  begin
    if public.admin_suspender_usuario(v_a, 'otro', '', 'o@example.com') <> 'motivo_invalido' then raise exception 'FAIL: aceptó un motivo inválido'; end if;
    if public.admin_suspender_usuario(v_a, 'mal_uso', repeat('x', 301), 'o@example.com') <> 'nota_larga' then raise exception 'FAIL: aceptó una nota de más de 300'; end if;
    if public.admin_suspender_usuario(gen_random_uuid(), 'mal_uso', '', 'o@example.com') <> 'no_existe' then raise exception 'FAIL: suspendió a un usuario inexistente'; end if;
    raise notice 'PASS: motivo, nota y usuario inexistente se validan';

    if public.admin_suspender_usuario(v_a, 'mal_uso', 'nota interna secreta', 'Dueno@Example.com') <> 'ok' then raise exception 'FAIL: no suspendió'; end if;
    if public.admin_suspender_usuario(v_a, 'falta_de_pago', '', 'o@example.com') <> 'ya_suspendida' then raise exception 'FAIL: dos suspensiones activas'; end if;
    if (select count(*) from public.suspensiones where usuario_id = v_a and levantada_at is null) <> 1 then raise exception 'FAIL: más de una activa'; end if;
    raise notice 'PASS: una sola suspensión activa por cuenta';

    -- Un administrador activo no se puede suspender.
    select lower(u.email::text) into v_email_a from auth.users u where u.id = v_b;
    if v_email_a is not null then
      perform public.admin_agregar_administrador(v_email_a, 'dueno@example.com');
      if public.admin_suspender_usuario(v_b, 'mal_uso', '', 'o@example.com') <> 'protegida' then raise exception 'FAIL: suspendió a un administrador'; end if;
      perform public.admin_revocar_administrador(v_email_a);
      raise notice 'PASS: un administrador activo no se puede suspender';
    end if;
  end;
  $$;

  -- Visibilidad
  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    v_b uuid := current_setting('app.b')::uuid;
    n int;
    m text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.mi_suspension();
    if n <> 1 then reset role; raise exception 'FAIL: la cuenta suspendida no ve su suspensión (%)', n; end if;
    select ms_motivo into m from public.mi_suspension();
    if m <> 'mal_uso' then reset role; raise exception 'FAIL: motivo equivocado (%)', m; end if;
    select count(*) into n from public.suspensiones where usuario_id = v_a;
    if n <> 1 then reset role; raise exception 'FAIL: la cuenta no lee su fila por RLS (%)', n; end if;
    begin
      execute 'select nota from public.suspensiones';
      reset role;
      raise exception 'FAIL: la cuenta pudo leer la nota interna';
    exception when insufficient_privilege then
      set local role authenticated;
    end;
    begin
      execute 'select suspendido_por from public.suspensiones';
      reset role;
      raise exception 'FAIL: la cuenta pudo leer quién suspendió';
    exception when insufficient_privilege then
      set local role authenticated;
    end;
    begin
      execute 'update public.suspensiones set levantada_at = now()';
      reset role;
      raise exception 'FAIL: la cuenta pudo levantar su propia suspensión';
    exception when insufficient_privilege then
      set local role authenticated;
    end;
    reset role;
    raise notice 'PASS: la cuenta suspendida ve su suspensión, sin nota ni autor, y no la puede tocar';

    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.mi_suspension();
    if n <> 0 then reset role; raise exception 'FAIL: otra cuenta ve una suspensión (%)', n; end if;
    select count(*) into n from public.suspensiones where usuario_id = v_a;
    if n <> 0 then reset role; raise exception 'FAIL: otra cuenta lee la fila ajena por RLS (%)', n; end if;
    reset role;
    raise notice 'PASS: las demás cuentas no ven la suspensión ajena';
  end;
  $$;

  -- Panel: filtro y marca, historial, reactivación
  do $$
  declare
    v_a uuid := current_setting('app.a')::uuid;
    r record;
  begin
    select * into r from public.admin_usuarios(v_a::text, 'suspendidos', 5, 0) where o_id = v_a;
    if not found then raise exception 'FAIL: admin_usuarios no lista al suspendido'; end if;
    if not r.o_suspendido or r.o_suspension_motivo <> 'mal_uso' then raise exception 'FAIL: admin_usuarios no marca la suspensión'; end if;
    select * into r from public.admin_usuarios(v_a::text, 'todos', 5, 0) where o_id = v_a;
    if not found then raise exception 'FAIL: falta en el listado general'; end if;
    if not r.o_suspendido then raise exception 'FAIL: la marca falta en el listado general'; end if;
    raise notice 'PASS: admin_usuarios filtra y marca suspendidos';

    if (select count(*) from public.admin_suspensiones_de(v_a)) <> 1 then raise exception 'FAIL: historial'; end if;
    if not public.admin_reactivar_usuario(v_a, 'Dueno@Example.com') then raise exception 'FAIL: no reactivó'; end if;
    if public.admin_reactivar_usuario(v_a, 'dueno@example.com') then raise exception 'FAIL: reactivó dos veces'; end if;
    if exists (select 1 from public.admin_usuarios(v_a::text, 'suspendidos', 5, 0) where o_id = v_a) then raise exception 'FAIL: sigue en suspendidos'; end if;
    if public.admin_suspender_usuario(v_a, 'falta_de_pago', '', 'o@example.com') <> 'ok' then raise exception 'FAIL: no pudo volver a suspender tras reactivar'; end if;
    if (select count(*) from public.admin_suspensiones_de(v_a)) <> 2 then raise exception 'FAIL: el historial no conserva la anterior'; end if;
    raise notice 'PASS: reactivar levanta, conserva el historial y permite suspender de nuevo';
  end;
  $$;
rollback;

-- ===========================================================================
-- 4 — envíos masivos: alta, un solo envío activo, límite de 10 minutos, lotes sin repetir, cancelación
-- ===========================================================================
begin;
  select set_config('app.a', (:user_a)::text, true), set_config('app.b', (:user_b)::text, true);
  delete from public.envios_masivos;
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth)
  values (:user_a, 'https://test.invalid/gestion-a1', 'p', 'a'),
         (:user_a, 'https://test.invalid/gestion-a2', 'p', 'a'),
         (:user_b, 'https://test.invalid/gestion-b1', 'p', 'a')
  on conflict (endpoint) do nothing;

  do $$
  declare
    r record;
    v_id uuid;
    v_total int;
    v_vistos uuid[] := '{}';
    v_lote record;
    v_pasos int := 0;
    v_distintos int;
  begin
    select count(distinct usuario_id) into v_distintos from public.push_suscripciones;

    -- validación
    for r in
      select * from (values ('', 'c', '/app'), ('t', '', '/app'), (repeat('t', 61), 'c', '/app'), ('t', repeat('c', 181), '/app'),
        ('t', 'c', 'https://evil.com'), ('t', 'c', '//evil.com'), ('t', 'c', '/application'), ('t', 'c', '/app/../x'), ('t', 'c', '/app x'))
        as v(t, c, e)
    loop
      if (select cr_resultado from public.crear_envio_masivo(r.t, r.c, r.e, 'dueno@example.com')) <> 'invalido' then
        raise exception 'FAIL: aceptó una entrada inválida (% / % / %)', left(r.t, 10), left(r.c, 10), r.e;
      end if;
    end loop;
    raise notice 'PASS: crear_envio_masivo valida título, mensaje y enlace';

    select * into r from public.crear_envio_masivo('Novedad', 'Mirá lo nuevo', '/app/avisos', 'Dueno@Example.com');
    if r.cr_resultado <> 'ok' or r.cr_id is null then raise exception 'FAIL: no creó (%)', r.cr_resultado; end if;
    v_id := r.cr_id;
    if r.cr_usuarios <> v_distintos then raise exception 'FAIL: total de usuarios (% vs %)', r.cr_usuarios, v_distintos; end if;
    if (select count(*) from public.push_suscripciones) <> r.cr_dispositivos then raise exception 'FAIL: total de dispositivos'; end if;
    v_total := r.cr_usuarios;
    raise notice 'PASS: crea el envío con los totales';

    if (select cr_resultado from public.crear_envio_masivo('Otro', 'Otro', '/app', 'dueno@example.com')) <> 'en_curso' then
      raise exception 'FAIL: permitió dos envíos activos';
    end if;
    raise notice 'PASS: un solo envío activo a la vez';

    -- lotes de a 1 usuario: no se repite ninguno y la unión es todo el universo
    loop
      v_pasos := v_pasos + 1;
      exit when v_pasos > v_total + 5;
      select * into v_lote from public.reclamar_lote_envio_masivo(1);
      exit when not found;
      if cardinality(v_lote.lt_usuarios) <> 1 then raise exception 'FAIL: tamaño de lote %', cardinality(v_lote.lt_usuarios); end if;
      if v_lote.lt_usuarios[1] = any (v_vistos) then raise exception 'FAIL: reclamó dos veces al mismo usuario'; end if;
      if v_lote.lt_envio_id <> v_id or v_lote.lt_titulo <> 'Novedad' or v_lote.lt_enlace <> '/app/avisos' then raise exception 'FAIL: datos del lote'; end if;
      v_vistos := v_vistos || v_lote.lt_usuarios[1];
      perform public.registrar_progreso_envio_masivo(v_id, 1, 2, 1);
    end loop;
    if cardinality(v_vistos) <> v_total then raise exception 'FAIL: se reclamaron % de % usuarios', cardinality(v_vistos), v_total; end if;
    if (select estado from public.envios_masivos where id = v_id) <> 'terminado' then raise exception 'FAIL: no terminó'; end if;
    if (select usuarios_procesados || '/' || enviados || '/' || fallidos from public.envios_masivos where id = v_id) <> v_total || '/' || (2 * v_total) || '/' || v_total then
      raise exception 'FAIL: contadores de progreso';
    end if;
    if exists (select 1 from public.reclamar_lote_envio_masivo(10)) then raise exception 'FAIL: reclamó con todo terminado'; end if;
    raise notice 'PASS: lotes sin repetir usuarios, progreso acumulado y cierre';

    -- límite de 10 minutos
    select * into r from public.crear_envio_masivo('Nuevo', 'Nuevo', '/app', 'dueno@example.com');
    if r.cr_resultado <> 'limite' or r.cr_espera_seg <= 0 or r.cr_espera_seg > 600 then raise exception 'FAIL: límite de 10 minutos (%, %)', r.cr_resultado, r.cr_espera_seg; end if;
    update public.envios_masivos set created_at = now() - interval '11 minutes' where id = v_id;
    select * into r from public.crear_envio_masivo('Nuevo', 'Nuevo', '/app', 'dueno@example.com');
    if r.cr_resultado <> 'ok' then raise exception 'FAIL: no dejó crear pasada la ventana (%)', r.cr_resultado; end if;
    raise notice 'PASS: un envío cada 10 minutos';

    -- cancelación: no se reclama más, no cuenta para el límite
    v_id := r.cr_id;
    select * into v_lote from public.reclamar_lote_envio_masivo(1);
    if not found then raise exception 'FAIL: no reclamó el primer lote'; end if;
    if not public.cancelar_envio_masivo(v_id, 'Dueno@Example.com') then raise exception 'FAIL: no canceló'; end if;
    if public.cancelar_envio_masivo(v_id, 'dueno@example.com') then raise exception 'FAIL: canceló dos veces'; end if;
    if exists (select 1 from public.reclamar_lote_envio_masivo(10)) then raise exception 'FAIL: reclamó un envío cancelado'; end if;
    select * into r from public.crear_envio_masivo('Tras cancelar', 'Ok', '/app', 'dueno@example.com');
    -- El cancelado no cuenta para el límite y el terminado anterior es de hace 11 minutos: tiene que poder crear.
    if r.cr_resultado <> 'ok' then raise exception 'FAIL: un envío cancelado frenó uno nuevo (%)', r.cr_resultado; end if;
    raise notice 'PASS: cancelar detiene los lotes y un cancelado no cuenta para el límite';
  end;
  $$;
rollback;
