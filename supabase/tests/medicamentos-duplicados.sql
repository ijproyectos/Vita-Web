-- SOLO base local desechable, con auth y migraciones existentes + 037.
-- psql <conexion-local> -X -v ON_ERROR_STOP=1 -f supabase/tests/medicamentos-duplicados.sql
-- Ejecutar como postgres: fixtures sintéticas, roles reales y ROLLBACK final.
-- No necesita cuentas, credenciales ni filas de personas reales.
-- No ejecutar contra producción. Un error aborta la transacción y la conexión
-- de psql revierte las fixtures; no hay commits ni efectos externos.
\set ON_ERROR_STOP on
begin;

select set_config('test.persona', gen_random_uuid()::text, true);
select set_config('test.otra', gen_random_uuid()::text, true);
select set_config('test.editor', gen_random_uuid()::text, true);
select set_config('test.lector', gen_random_uuid()::text, true);
insert into auth.users(id)
select current_setting(clave)::uuid from unnest(array['test.persona','test.otra','test.editor','test.lector']) clave;
insert into public.vinculos_cuidador(elder_id, cuidador_id, email_invitado, estado, aceptado_at, rol)
values
 (current_setting('test.persona')::uuid, current_setting('test.editor')::uuid, '', 'aceptado', now(), 'editar'),
 (current_setting('test.persona')::uuid, current_setting('test.lector')::uuid, '', 'aceptado', now(), 'ver');

select set_config('request.jwt.claim.sub', current_setting('test.persona'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.persona'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  persona uuid := current_setting('test.persona')::uuid;
  clave text;
  caso record;
  id_semana uuid;
  filas bigint;
begin
  if public.medicamento_nombre_clave(U&' \00A0PRUEBA\2003A\FEFF ') <> 'prueba a'
     or public.medicamento_nombre_clave('  ÁCIDO   FÓLICO ') <> 'ácido fólico'
     or public.medicamento_hora_clave('8:00') <> 480
     or public.medicamento_hora_clave('08:00:00') <> 480 then
    raise exception 'FAIL: canonización';
  end if;

  insert into public.medicamentos(usuario_id,nombre,dosis,hora_programada,momento_dia)
  values(persona,'Prueba A','10','08:00','mañana');

  for caso in select * from (values
    ('Prueba A','10','08:00',array[]::text[]),
    ('  PRUEBA   A  ','999','8:00',array['lunes']),
    (E'\tprueba\nA',null::text,'08:00:00',array['domingo']),
    (U&'Prueba\00A0A',null::text,' 08:00 ',array['martes'])
  ) as casos(nombre,dosis,hora,dias) loop
    begin
      insert into public.medicamentos(usuario_id,nombre,dosis,hora_programada,momento_dia,dias_recurrentes)
      values(persona,caso.nombre,caso.dosis,caso.hora,'mañana',caso.dias);
      raise exception 'FAIL: duplicado aceptado';
    exception when exclusion_violation then
      get stacked diagnostics clave = constraint_name;
      if clave <> 'medicamentos_sin_horarios_duplicados' then raise; end if;
    end;
  end loop;
  raise notice 'PASS: diario, dosis distinta/omitida, casing, blancos y horas equivalentes';

  insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia,dias_recurrentes)
  values(persona,'Prueba B','09:00','mañana',array['lunes','miercoles']);
  insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia,dias_recurrentes)
  values(persona,'Prueba B','09:00','mañana',array['martes']) returning id into id_semana;
  insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia)
  values(persona,'Prueba A','09:00','mañana'),(persona,'Prueba A otra marca','08:00','mañana');

  for caso in select dias from (values(array['miercoles','viernes']), (array[]::text[])) casos(dias) loop
    begin
      insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia,dias_recurrentes)
      values(persona,'Prueba B','09:00','mañana',caso.dias);
      raise exception 'FAIL: solapamiento aceptado';
    exception when exclusion_violation then
      get stacked diagnostics clave = constraint_name;
      if clave <> 'medicamentos_sin_horarios_duplicados' then raise; end if;
    end;
  end loop;
  begin
    update public.medicamentos set dias_recurrentes=array['lunes'] where id=id_semana;
    raise exception 'FAIL: UPDATE días duplicados';
  exception when exclusion_violation then null;
  end;
  begin
    update public.medicamentos set hora_programada='08:00' where usuario_id=persona and nombre='Prueba A' and hora_programada='09:00';
    raise exception 'FAIL: UPDATE hora duplicada';
  exception when exclusion_violation then null;
  end;
  begin
    update public.medicamentos set nombre='Prueba A' where usuario_id=persona and nombre='Prueba A otra marca';
    raise exception 'FAIL: UPDATE nombre duplicado';
  exception when exclusion_violation then null;
  end;
  update public.medicamentos set dosis='otra dosis' where id=id_semana;
  select count(*) into filas from public.medicamentos where usuario_id=persona;
  if filas <> 5 then raise exception 'FAIL: mutación parcial'; end if;
  raise notice 'PASS: días disjuntos, otro horario/nombre y UPDATE con rollback del choque';

  for caso in select * from (values
    ('', '10:00', array[]::text[]),
    ('Inválido', '24:00', array[]::text[]),
    ('Inválido', '08:60', array[]::text[]),
    ('Inválido', '08:00:01', array[]::text[]),
    ('Inválido', '8:00:00', array[]::text[]),
    ('Inválido', '10:00', array['festivo']),
    ('Inválido', '10:00', array[null]::text[])
  ) casos(nombre,hora,dias) loop
    begin
      insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia,dias_recurrentes)
      values(persona,caso.nombre,caso.hora,'mañana',caso.dias);
      raise exception 'FAIL: inválido eludió exclusión';
    exception when check_violation then
      get stacked diagnostics clave = constraint_name;
      if clave <> 'medicamentos_claves_validas' then raise; end if;
    end;
  end loop;
  raise notice 'PASS: claves inválidas rechazadas';
end;
$$;

-- Otra persona puede tener la misma combinación sin acceso a la fila original.
select set_config('request.jwt.claim.sub', current_setting('test.otra'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.otra'), 'role', 'authenticated')::text, true);
insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia)
values(current_setting('test.otra')::uuid,'Prueba A','08:00','mañana');
do $$ begin
  if exists(select from public.medicamentos where usuario_id=current_setting('test.persona')::uuid) then
    raise exception 'FAIL: RLS lectura ajena';
  end if;
  begin
    insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia)
    values(current_setting('test.persona')::uuid,'Ajeno','11:00','mañana');
    raise exception 'FAIL: escritura ajena';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: otra persona válida, sin lectura ni escritura ajena';
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.editor'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.editor'), 'role', 'authenticated')::text, true);
do $$ begin
  insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia)
  values(current_setting('test.persona')::uuid,'Editor válido','11:00','mañana');
  begin
    insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia)
    values(current_setting('test.persona')::uuid,'Prueba A','08:00','mañana');
    raise exception 'FAIL: editor evade exclusión';
  exception when exclusion_violation then null;
  end;
  raise notice 'PASS: cuidador editor conserva escritura y respeta exclusión';
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.lector'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.lector'), 'role', 'authenticated')::text, true);
do $$ begin
  begin
    insert into public.medicamentos(usuario_id,nombre,hora_programada,momento_dia)
    values(current_setting('test.persona')::uuid,'Lector inválido','12:00','mañana');
    raise exception 'FAIL: lector escribe';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: cuidador lector conserva restricción de escritura';
end $$;
rollback;

-- Concurrencia NO probada por este script de una sesión. En una DB local
-- desechable, preparar una cuenta sintética y usar dos sesiones autorizadas:
-- A: BEGIN; INSERT medicamento diario X a las 08:00 (sin COMMIT).
-- B: BEGIN; INSERT mismo usuario/X/08:00 con lunes; queda esperando a A.
-- A: COMMIT => B recibe 23P01, constraint medicamentos_sin_horarios_duplicados.
-- Alternativa: A: ROLLBACK => B continúa; B: ROLLBACK.
-- Repetir con UPDATE y días solapados; días disjuntos deben poder confirmar.
-- Limpiar las fixtures de A tras cada COMMIT. No declarar concurrencia validada
-- sin ejecutar esas sesiones. Las RPC quedan cubiertas por la constraint de
-- tabla; los caminos RPC específicos requieren sus propias pruebas existentes.
