-- Testing de vita track dentro del panel — tests para la migración 063.
--
-- Script psql a mano: una transacción con ROLLBACK (no persiste nada). Verifica que NI anon NI un usuario `authenticated`
-- común (un paciente de vita) puedan leer o escribir ninguna tabla track_*, ni listar/leer/escribir el bucket
-- `track-adjuntos`, y que service_role (el panel) sí pueda. Un run limpio imprime un `NOTICE: PASS: ...` por aserción y
-- falla con `FAIL: ...` ante cualquier desvío. Requisitos: migración 063 aplicada y una cuenta real (user_a).
--
-- Run:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -f supabase/tests/track-testing.sql

\set ON_ERROR_STOP on

begin;
  select set_config('app.a', (:user_a)::text, true);

  -- 0 — estructura: RLS habilitada y ninguna policy en las tablas track_* ni sobre el bucket
  do $$
  declare
    t text;
    n int;
  begin
    foreach t in array array['track_casos','track_rondas','track_asignaciones','track_bugs','track_reportes','track_pruebas','track_bug_eventos','track_adjuntos']
    loop
      if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
        raise exception 'FAIL: % sin RLS', t;
      end if;
      select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
      if n <> 0 then raise exception 'FAIL: % tiene % policies (debe tener 0)', t, n; end if;
    end loop;
    raise notice 'PASS: las 8 tablas track_* tienen RLS y ninguna policy';

    select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%track-adjuntos%';
    if n <> 0 then raise exception 'FAIL: hay policies sobre storage.objects para track-adjuntos'; end if;
    raise notice 'PASS: el bucket track-adjuntos no tiene policies';

    if (select public from storage.buckets where id = 'track-adjuntos') is distinct from false then
      raise exception 'FAIL: el bucket track-adjuntos no es privado';
    end if;
    if (select file_size_limit from storage.buckets where id = 'track-adjuntos') <> 26214400 then
      raise exception 'FAIL: límite del bucket distinto de 25 MB';
    end if;
    raise notice 'PASS: bucket privado con límite de 25 MB';
  end;
  $$;

  -- 1 — service_role (el panel) sí puede escribir y leer; códigos automáticos T-/B-/U-
  set local role service_role;
  do $$
  declare
    v_caso bigint;
    v_bug bigint;
    v_codigo text;
  begin
    insert into public.track_casos (codigo, area, funcionalidad, prioridad) values ('', 'Acceso', 'Caso de prueba del test', 'Alta') returning id, codigo into v_caso, v_codigo;
    if v_codigo !~ '^T-[0-9]+$' then raise exception 'FAIL: código de caso % no es T-nn', v_codigo; end if;
    insert into public.track_bugs (codigo, titulo, caso_id, creado_por) values ('', 'Bug del test', v_caso, 'test@example.com') returning id, codigo into v_bug, v_codigo;
    if v_codigo !~ '^B-[0-9]+$' then raise exception 'FAIL: código de bug % no es B-nn', v_codigo; end if;
    insert into public.track_reportes (codigo, paso, creado_por) values ('', 'Reporte del test', 'test@example.com') returning codigo into v_codigo;
    if v_codigo !~ '^U-[0-9]+$' then raise exception 'FAIL: código de reporte % no es U-nn', v_codigo; end if;
    insert into public.track_pruebas (caso_id, estado, admin_email) values (v_caso, 'Falla', 'test@example.com');
    insert into public.track_bug_eventos (bug_id, actor_email, accion, cuerpo) values (v_bug, 'test@example.com', 'comentario', 'hola');
    if (select count(*) from public.track_casos where id = v_caso) <> 1 then raise exception 'FAIL: service_role no lee lo que escribió'; end if;
    raise notice 'PASS: service_role escribe y lee, y los códigos se asignan solos';
  end;
  $$;
  reset role;

  -- 2 — authenticated (un paciente de vita): ninguna tabla se puede leer ni escribir
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('app.a'), 'role', 'authenticated', 'email', 'paciente@example.com')::text, true);
  set local role authenticated;
  do $$
  declare
    t text;
    ok boolean;
  begin
    foreach t in array array['track_casos','track_rondas','track_asignaciones','track_bugs','track_reportes','track_pruebas','track_bug_eventos','track_adjuntos']
    loop
      ok := false;
      begin
        execute format('select 1 from public.%I limit 1', t);
      exception when insufficient_privilege then ok := true;
      end;
      if not ok then raise exception 'FAIL: authenticated pudo leer %', t; end if;
    end loop;
    raise notice 'PASS: authenticated no puede leer ninguna tabla track_*';

    ok := false;
    begin
      insert into public.track_casos (codigo, area) values ('T-999', 'Acceso');
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FAIL: authenticated pudo insertar un caso'; end if;
    ok := false;
    begin
      insert into public.track_bugs (codigo, titulo, creado_por) values ('B-999', 'x', 'paciente@example.com');
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FAIL: authenticated pudo insertar un bug'; end if;
    ok := false;
    begin
      update public.track_bugs set estado = 'Verificado';
      -- sin privilegio falla arriba; si llegara acá, no debe haber tocado filas
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FAIL: authenticated pudo actualizar bugs'; end if;
    ok := false;
    begin
      delete from public.track_casos;
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FAIL: authenticated pudo borrar casos'; end if;
    raise notice 'PASS: authenticated no puede insertar, actualizar ni borrar';

    -- el bucket: ni listar ni leer ni subir ni borrar objetos
    if (select count(*) from storage.objects where bucket_id = 'track-adjuntos') <> 0 then
      raise exception 'FAIL: authenticated ve objetos de track-adjuntos';
    end if;
    ok := false;
    begin
      insert into storage.objects (bucket_id, name, owner) values ('track-adjuntos', 'adjuntos/test.png', current_setting('app.a')::uuid);
    exception when others then ok := true;
    end;
    if not ok then raise exception 'FAIL: authenticated pudo subir a track-adjuntos'; end if;
    raise notice 'PASS: authenticated no ve ni sube objetos del bucket track-adjuntos';
  end;
  $$;
  reset role;

  -- 3 — anon: lo mismo
  set local role anon;
  do $$
  declare
    t text;
    ok boolean;
  begin
    foreach t in array array['track_casos','track_rondas','track_asignaciones','track_bugs','track_reportes','track_pruebas','track_bug_eventos','track_adjuntos']
    loop
      ok := false;
      begin
        execute format('select 1 from public.%I limit 1', t);
      exception when insufficient_privilege then ok := true;
      end;
      if not ok then raise exception 'FAIL: anon pudo leer %', t; end if;
    end loop;
    ok := false;
    begin
      insert into public.track_reportes (codigo, paso, creado_por) values ('U-999', 'x', 'anon@example.com');
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'FAIL: anon pudo insertar un reporte'; end if;
    if (select count(*) from storage.objects where bucket_id = 'track-adjuntos') <> 0 then
      raise exception 'FAIL: anon ve objetos de track-adjuntos';
    end if;
    raise notice 'PASS: anon no puede leer ni escribir tablas ni bucket';
  end;
  $$;
  reset role;

  -- 4 — las funciones de códigos no son ejecutables por anon/authenticated
  do $$
  begin
    if has_function_privilege('anon', 'public.track_asignar_codigo()', 'execute') or has_function_privilege('authenticated', 'public.track_asignar_codigo()', 'execute') then
      raise exception 'FAIL: track_asignar_codigo ejecutable por anon/authenticated';
    end if;
    raise notice 'PASS: las funciones internas no son ejecutables por anon/authenticated';
  end;
  $$;
rollback;
