-- Velocidad real (Web Vitals) — tests de la migración 050 (web_vitals + admin_web_vitals + índices).
--
-- Script psql a mano: cada sección es una transacción con ROLLBACK. Una corrida limpia imprime un
-- `NOTICE: PASS: ...` por aserción; cualquier `FAIL:` aborta la sección. Conectar como `postgres` (pooler).
-- Requisitos: migración 050 aplicada y una cuenta real (user_a) para simular un usuario autenticado.
--
-- Correr:
--   psql "<pooler connection string>" -v user_a="'<uuid>'" -f supabase/tests/vitals.sql

\set ON_ERROR_STOP on

-- 1 — la tabla tiene RLS activa y ninguna policy (solo service_role)
begin;
  do $$
  declare rls boolean; n int;
  begin
    select relrowsecurity into rls from pg_class where oid = 'public.web_vitals'::regclass;
    if rls is not true then raise exception 'FAIL: web_vitals sin RLS'; end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'web_vitals';
    if n <> 0 then raise exception 'FAIL: web_vitals tiene % policies (deberian ser 0)', n; end if;
    raise notice 'PASS: web_vitals con RLS y sin policies';
  end $$;
rollback;

-- 2 — los CHECK rechazan metricas, ratings y dispositivos inventados
begin;
  do $$
  begin
    begin
      insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo) values ('/app', 'FID', 1, 'good', 'mobile');
      raise exception 'FAIL: acepto una metrica desconocida';
    exception when check_violation then
      raise notice 'PASS: metrica desconocida rechazada';
    end;
    begin
      insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo) values ('/app', 'LCP', -5, 'good', 'mobile');
      raise exception 'FAIL: acepto un valor negativo';
    exception when check_violation then
      raise notice 'PASS: valor negativo rechazado';
    end;
    begin
      insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo) values ('/app', 'LCP', 1, 'good', 'tablet');
      raise exception 'FAIL: acepto un dispositivo desconocido';
    exception when check_violation then
      raise notice 'PASS: dispositivo desconocido rechazado';
    end;
  end $$;
rollback;

-- 3 — admin_web_vitals calcula p75 por metrica y devuelve las rutas lentas (con al menos 3 mediciones)
begin;
  do $$
  declare m jsonb; r jsonb; p75 numeric;
  begin
    delete from public.web_vitals;
    insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo)
    select '/app/rutina', 'LCP', v, case when v <= 2500 then 'good' else 'poor' end, 'mobile'
    from unnest(array[1000, 2000, 3000, 4000]) as v;
    insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo)
    select '/app', 'LCP', v, 'good', 'desktop' from unnest(array[500, 600, 700]) as v;
    -- Solo 2 mediciones: no entra en el ranking de rutas.
    insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo)
    select '/login', 'LCP', v, 'poor', 'mobile' from unnest(array[9000, 9500]) as v;

    select o_datos into m from public.admin_web_vitals(7) where o_seccion = 'metricas';
    select o_datos into r from public.admin_web_vitals(7) where o_seccion = 'rutas_lentas';

    p75 := (m -> 0 ->> 'p75')::numeric;
    if m -> 0 ->> 'metrica' <> 'LCP' or (m -> 0 ->> 'n')::int <> 9 then raise exception 'FAIL: metricas inesperadas %', m; end if;
    if p75 is null then raise exception 'FAIL: sin p75'; end if;
    if jsonb_array_length(r) <> 2 then raise exception 'FAIL: rutas lentas inesperadas %', r; end if;
    if r -> 0 ->> 'ruta' <> '/app/rutina' then raise exception 'FAIL: la mas lenta deberia ser /app/rutina (%)', r; end if;
    raise notice 'PASS: admin_web_vitals calcula p75 y ordena las rutas lentas';
  end $$;
rollback;

-- 4 — un usuario autenticado y anon no leen la tabla ni ejecutan la funcion
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    begin
      select count(*) into n from public.web_vitals;
      raise exception 'FAIL: authenticated lee web_vitals';
    exception when insufficient_privilege then
      raise notice 'PASS: web_vitals sin acceso para authenticated';
    end;
    begin
      perform * from public.admin_web_vitals(7);
      raise exception 'FAIL: authenticated ejecuto admin_web_vitals';
    exception when insufficient_privilege then
      raise notice 'PASS: admin_web_vitals no es ejecutable por authenticated';
    end;
  end $$;
rollback;

begin;
  set local role anon;
  do $$
  declare n int;
  begin
    begin
      select count(*) into n from public.web_vitals;
      raise exception 'FAIL: anon lee web_vitals';
    exception when insufficient_privilege then
      raise notice 'PASS: web_vitals sin acceso para anon';
    end;
    begin
      insert into public.web_vitals (ruta, metrica, valor, rating, dispositivo) values ('/app', 'LCP', 1, 'good', 'mobile');
      raise exception 'FAIL: anon inserto en web_vitals';
    exception when insufficient_privilege then
      raise notice 'PASS: anon no puede insertar en web_vitals';
    end;
    begin
      perform * from public.admin_web_vitals(7);
      raise exception 'FAIL: anon ejecuto admin_web_vitals';
    exception when insufficient_privilege then
      raise notice 'PASS: admin_web_vitals no es ejecutable por anon';
    end;
  end $$;
rollback;

-- 5 — existen los tres indices de rendimiento
begin;
  do $$
  declare faltan text;
  begin
    select string_agg(i, ', ') into faltan
    from unnest(array['idx_vinculos_cuidador_elder_aceptado', 'idx_medicamentos_tomas_usuario_fecha', 'idx_mensajes_chat_usuario_creado']) as i
    where to_regclass('public.' || i) is null;
    if faltan is not null then raise exception 'FAIL: faltan indices: %', faltan; end if;
    raise notice 'PASS: indices de rendimiento presentes';
  end $$;
rollback;
