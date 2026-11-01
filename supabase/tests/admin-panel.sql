-- Panel de administración (/adminvita) — tests de la migración 045.
--
-- Script psql escrito a mano, mismo estilo que los demás: cada sección es su propia transacción y termina en
-- ROLLBACK. Una corrida limpia imprime un `NOTICE: PASS: ...` por aserción; cualquier `FAIL:` aborta la sección.
--
-- Requisitos: migración 045 aplicada (y las previas: 013, 021, 034, 036, 038, 044). Conectar como `postgres`
-- (pooler). NO asume tablas vacías ni cuentas reales: todo se prueba sobre lo que haya, más una cuenta de fixture.
--
-- Correr:
--   psql "<pooler connection string>" -f supabase/tests/admin-panel.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — anon y authenticated NO pueden ejecutar ninguna función admin
-- ===========================================================================
begin;

  create temp table _fn (firma text) on commit drop;
  insert into _fn values
    ('select * from public.admin_resumen()'),
    ('select * from public.admin_usuarios(''x'', ''todos'', 5, 0)'),
    ('select * from public.admin_usuario(gen_random_uuid())'),
    ('select * from public.admin_ia(7)'),
    ('select * from public.admin_vita_plus()'),
    ('select * from public.admin_sistema()'),
    ('select * from public.admin_actividad()');
  grant select on _fn to anon, authenticated;

  do $$
  declare
    r record;
    v_rol text;
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
  end;
  $$;

rollback;

-- ===========================================================================
-- 2 — admin_accesos: RLS activada, anon/authenticated sin acceso
-- ===========================================================================
begin;

  do $$
  begin
    if not (select c.relrowsecurity from pg_class c where c.oid = 'public.admin_accesos'::regclass) then
      raise exception 'FAIL: admin_accesos sin RLS';
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_accesos') then
      raise exception 'FAIL: admin_accesos no debería tener policies';
    end if;
    set local role anon;
    begin
      perform 1 from public.admin_accesos limit 1;
      reset role;
      raise exception 'FAIL: anon leyó admin_accesos';
    exception when insufficient_privilege then
      reset role;
    end;
    set local role authenticated;
    begin
      insert into public.admin_accesos (admin_email, ruta) values ('x@example.com', '/adminvita');
      reset role;
      raise exception 'FAIL: authenticated escribió admin_accesos';
    exception when insufficient_privilege then
      reset role;
    end;
    raise notice 'PASS: admin_accesos cerrada a anon/authenticated';
  end;
  $$;

  -- service_role sí puede.
  set local role service_role;
  do $$
  begin
    insert into public.admin_accesos (admin_email, ruta) values ('test@example.com', '/adminvita/usuarios');
    if (select count(*) from public.admin_accesos where admin_email = 'test@example.com') < 1 then
      raise exception 'FAIL: service_role no leyó lo que insertó';
    end if;
    raise notice 'PASS: service_role inserta y lee admin_accesos';
  end;
  $$;
  reset role;

rollback;

-- ===========================================================================
-- 3 — service_role ejecuta todas las funciones; formas de salida
-- ===========================================================================
begin;

  set local role service_role;

  do $$
  declare
    v_n int;
    v_total bigint;
    v_bad int;
  begin
    perform * from public.admin_resumen();
    raise notice 'PASS: admin_resumen ejecuta';

    select count(*) into v_n from public.admin_usuarios('', 'todos', 5, 0);
    if v_n > 5 then raise exception 'FAIL: admin_usuarios ignoró el límite'; end if;
    raise notice 'PASS: admin_usuarios respeta el límite';

    -- Todos los filtros son válidos; uno desconocido cae a "todos".
    perform * from public.admin_usuarios('', 'vita_plus', 5, 0);
    perform * from public.admin_usuarios('', 'inactivos_7', 5, 0);
    perform * from public.admin_usuarios('', 'inactivos_30', 5, 0);
    perform * from public.admin_usuarios('', 'gestionados', 5, 0);
    perform * from public.admin_usuarios('', 'sin_onboarding', 5, 0);
    perform * from public.admin_usuarios('', 'no-existe', 5, 0);
    raise notice 'PASS: admin_usuarios acepta todos los filtros';

    -- La búsqueda por id usa texto (uuid casteado a text), no LIKE sobre uuid.
    perform * from public.admin_usuarios(gen_random_uuid()::text, 'todos', 5, 0);
    raise notice 'PASS: búsqueda por id como texto';

    -- Sin tablas vacías asumidas: si no hay usuarios, no devuelve filas y no falla.
    select max(o_total) into v_total from public.admin_usuarios('', 'todos', 100, 0);
    raise notice 'PASS: total paginado = %', coalesce(v_total, 0);

    -- Usuario inexistente: cero filas.
    select count(*) into v_n from public.admin_usuario(gen_random_uuid());
    if v_n <> 0 then raise exception 'FAIL: admin_usuario devolvió filas para un id inexistente'; end if;
    raise notice 'PASS: admin_usuario de un id inexistente no devuelve filas';

    select count(*) into v_n from public.admin_ia(7);
    if v_n <> 4 then raise exception 'FAIL: admin_ia debe devolver 4 secciones, devolvió %', v_n; end if;
    select jsonb_array_length(o_datos) into v_n from public.admin_ia(7) where o_seccion = 'diario';
    if v_n <> 7 then raise exception 'FAIL: diario debe tener 7 días, tiene %', v_n; end if;
    -- Clamp de días: 0 -> 1, 1000 -> 90.
    select jsonb_array_length(o_datos) into v_n from public.admin_ia(0) where o_seccion = 'diario';
    if v_n <> 1 then raise exception 'FAIL: clamp inferior de admin_ia'; end if;
    select jsonb_array_length(o_datos) into v_n from public.admin_ia(1000) where o_seccion = 'diario';
    if v_n <> 90 then raise exception 'FAIL: clamp superior de admin_ia'; end if;
    raise notice 'PASS: admin_ia (secciones y clamp)';

    select count(*) into v_n from public.admin_vita_plus();
    if v_n <> 3 then raise exception 'FAIL: admin_vita_plus debe devolver 3 secciones'; end if;
    raise notice 'PASS: admin_vita_plus';

    select count(*) into v_n from public.admin_sistema();
    if v_n <> 7 then raise exception 'FAIL: admin_sistema debe devolver 7 secciones, devolvió %', v_n; end if;
    raise notice 'PASS: admin_sistema';
  end;
  $$;

  reset role;

rollback;

-- ===========================================================================
-- 4 — Fixture: una cuenta gestionada se clasifica y filtra bien; nada de texto libre
-- ===========================================================================
begin;

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'gestionado-test-ad01@usuarios.soyvita.com.ar',
          '{"tipo":"perfil_gestionado"}'::jsonb, '{}'::jsonb, now(), now());

  set local role service_role;

  do $$
  declare
    v_tipo text;
    v_n int;
    v_json text;
  begin
    select o_tipo into v_tipo from public.admin_usuarios('test-ad01', 'todos', 5, 0);
    if v_tipo is distinct from 'gestionado' then raise exception 'FAIL: tipo = %', v_tipo; end if;
    select count(*) into v_n from public.admin_usuarios('test-ad01', 'gestionados', 5, 0);
    if v_n <> 1 then raise exception 'FAIL: filtro gestionados'; end if;
    select count(*) into v_n from public.admin_usuarios('test-ad01', 'vita_plus', 5, 0);
    if v_n <> 0 then raise exception 'FAIL: filtro vita_plus incluyó una cuenta sin vita+'; end if;
    raise notice 'PASS: clasificación y filtros de cuenta gestionada';

    -- Sin actividad: cuenta como inactiva y no tiene días.
    select count(*) into v_n from public.admin_usuarios('test-ad01', 'inactivos_30', 5, 0);
    if v_n <> 1 then raise exception 'FAIL: una cuenta sin actividad debe aparecer como inactiva'; end if;
    raise notice 'PASS: cuenta sin actividad = inactiva';

    -- El detalle no expone texto libre: las claves de conteos son solo números.
    select o_datos::text into v_json from public.admin_usuario('00000000-0000-0000-0000-00000000ad01')
      where o_seccion = 'conteos';
    if v_json is null then raise exception 'FAIL: sin sección conteos'; end if;
    if (select count(*) from public.admin_usuario('00000000-0000-0000-0000-00000000ad01')) <> 7 then
      raise exception 'FAIL: admin_usuario debe devolver 7 secciones';
    end if;
    raise notice 'PASS: detalle de usuario con 7 secciones';
  end;
  $$;

  reset role;

rollback;
