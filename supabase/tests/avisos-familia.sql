-- Avisos de familia (migración 028). Script psql; cada sección termina en ROLLBACK.
-- Requisitos: 020, 021 y 028 aplicadas; cuidador_id y elder_id con vínculo aceptado.
--   psql "<pooler>" -v cuidador_id="'<uuid>'" -v elder_id="'<uuid>'" -v otro_id="'<uuid>'" -f supabase/tests/avisos-familia.sql
\set ON_ERROR_STOP on
select set_config('test.cuidador', (:cuidador_id)::text, false);
select set_config('test.otro', (:otro_id)::text, false);

-- A — persona_id se guarda y el dueño (cuidador) lo lee; un ajeno no.
begin;
  insert into avisos (id, usuario_id, tipo, titulo, persona_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001', :cuidador_id, 'resumen_dia_persona', 'Elsa tomó 4 de 5 hoy', :elder_id);
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$ declare n int; begin
    select count(*) into n from avisos where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'FAIL: ajeno ve aviso de familia'; end if;
    raise notice 'PASS: aviso de familia invisible para ajeno';
    begin
      update avisos set persona_id = null where id = 'bbbbbbbb-0000-0000-0000-000000000001';
      raise exception 'FAIL: pudo reescribir persona_id';
    exception when insufficient_privilege then raise notice 'PASS: persona_id no es actualizable'; end;
  end $$;
rollback;

-- B — columnas nuevas de preferencias: defaults y owner-only.
begin;
  insert into preferencias_avisos (usuario_id) values (:cuidador_id) on conflict (usuario_id) do nothing;
  do $$ declare r record; begin
    select * into r from preferencias_avisos where usuario_id = current_setting('test.cuidador')::uuid;
    if r.pendiente_persona is not true or r.resumen_dia is not true or r.stock_persona is not true then raise exception 'FAIL: defaults'; end if;
    if r.turnos_persona is not false then raise exception 'FAIL: turnos_persona debe ser false por defecto'; end if;
    raise notice 'PASS: defaults de preferencias de familia';
  end $$;
  select set_config('request.jwt.claims', json_build_object('sub', :otro_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$ declare n int; begin
    update preferencias_avisos set resumen_dia = false where usuario_id = current_setting('test.cuidador')::uuid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: ajeno editó preferencias'; end if;
    raise notice 'PASS: preferencias ajenas intactas';
  end $$;
rollback;

-- C — dedupe: mismo (tipo, ref_id, fecha) no entra dos veces.
begin;
  insert into envios_avisos (tipo, ref_id, fecha, usuario_id) values ('resumen_dia_persona', 'cccccccc-0000-4000-a000-000000000001', current_date, :cuidador_id);
  do $$ begin
    begin
      insert into envios_avisos (tipo, ref_id, fecha, usuario_id) values ('resumen_dia_persona', 'cccccccc-0000-4000-a000-000000000001', current_date, current_setting('test.cuidador')::uuid);
      raise exception 'FAIL: dedupe no funcionó';
    exception when unique_violation then raise notice 'PASS: dedupe por (tipo, ref_id, fecha)'; end;
  end $$;
rollback;
