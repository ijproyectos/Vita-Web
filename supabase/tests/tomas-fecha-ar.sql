-- Fecha de tomas en hora argentina (migración 032) — test del backfill.
--
-- Script psql escrito a mano (no hay runner de SQL en el repo). Corre dentro de
-- una transacción que termina en ROLLBACK: no deja filas. Una corrida limpia
-- imprime `NOTICE: PASS: ...`; un `FAIL:` aborta. NO se pudo correr desde este
-- entorno (sin base de datos): correrlo contra un entorno de prueba.
--
-- Requisitos: migraciones hasta 031 aplicadas; UNA cuenta real (owner_id).
-- Este test ejecuta el cuerpo de 032 sobre filas sintéticas dentro de la
-- transacción: aplicar 032 antes lo hace idempotente (las filas se insertan ya
-- con fechas UTC, que es lo que el backfill tiene que corregir).
--
-- Correr:
--   psql "<connection string>" -v owner_id="'<uuid>'" -f supabase/tests/tomas-fecha-ar.sql

\set ON_ERROR_STOP on

select set_config('test.o', (:owner_id)::text, false);

begin;
  -- Un medicamento por caso (el unique es por medicamento y fecha).
  insert into medicamentos (id, usuario_id, nombre, hora_programada, momento_dia, dias_recurrentes)
  select ('aaaaaaaa-0000-0000-0000-00000000000' || n)::uuid, :owner_id, 'Test ' || n, '22:00', 'noche', '{}'
  from generate_series(1, 4) n;

  -- 1: marcada 22:30 AR del 10/10 (01:30Z del 11/10) con fecha UTC 11/10 -> debe pasar al 10/10.
  insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado, tomado_en)
  values ('aaaaaaaa-0000-0000-0000-000000000001', :owner_id, '2026-10-11', true, '2026-10-11T01:30:00Z');
  -- 2: marcada 10:00 AR del 10/10 con fecha UTC 10/10 -> no cambia.
  insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado, tomado_en)
  values ('aaaaaaaa-0000-0000-0000-000000000002', :owner_id, '2026-10-10', true, '2026-10-10T13:00:00Z');
  -- 3: sin tomar (desmarcada) -> se borra.
  insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado, tomado_en)
  values ('aaaaaaaa-0000-0000-0000-000000000003', :owner_id, '2026-10-10', false, null);
  -- 4: colisión: dos tomadas que caen en el mismo día AR (10/10): una con fecha UTC 10/10
  --    (15:00 AR) y otra con fecha UTC 11/10 (22:30 AR) -> queda la más reciente (22:30 AR).
  insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado, tomado_en)
  values ('aaaaaaaa-0000-0000-0000-000000000004', :owner_id, '2026-10-10', true, '2026-10-10T18:00:00Z'),
         ('aaaaaaaa-0000-0000-0000-000000000004', :owner_id, '2026-10-11', true, '2026-10-11T01:30:00Z');

  -- Cuerpo del backfill de 032 (sin el lock ni el chequeo del nombre).
  delete from medicamentos_tomas where not tomado and usuario_id = :owner_id;
  alter table medicamentos_tomas drop constraint medicamentos_tomas_medicamento_id_fecha_key;
  update medicamentos_tomas
  set fecha = (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date
  where usuario_id = :owner_id and tomado and tomado_en is not null
    and fecha <> (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date;
  delete from medicamentos_tomas t
  using (
    select id, row_number() over (
      partition by medicamento_id, fecha order by tomado_en desc nulls last, created_at desc, id desc) as rn
    from medicamentos_tomas where usuario_id = :owner_id
  ) d
  where t.id = d.id and d.rn > 1;
  alter table medicamentos_tomas
    add constraint medicamentos_tomas_medicamento_id_fecha_key unique (medicamento_id, fecha);

  do $$
  declare
    o uuid := current_setting('test.o')::uuid;
    n int;
    f date;
  begin
    select fecha into f from medicamentos_tomas where medicamento_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if f is distinct from date '2026-10-10' then raise exception 'FAIL: caso 1, fecha=%', f; end if;
    raise notice 'PASS: toma de las 22:30 AR queda en su día AR';

    select fecha into f from medicamentos_tomas where medicamento_id = 'aaaaaaaa-0000-0000-0000-000000000002';
    if f is distinct from date '2026-10-10' then raise exception 'FAIL: caso 2, fecha=%', f; end if;
    raise notice 'PASS: toma de la mañana no cambia';

    select count(*) into n from medicamentos_tomas where medicamento_id = 'aaaaaaaa-0000-0000-0000-000000000003';
    if n <> 0 then raise exception 'FAIL: caso 3, la fila sin tomar sigue'; end if;
    raise notice 'PASS: fila sin tomar borrada';

    select count(*) into n from medicamentos_tomas where medicamento_id = 'aaaaaaaa-0000-0000-0000-000000000004';
    if n <> 1 then raise exception 'FAIL: caso 4, quedaron % filas', n; end if;
    if not exists (select 1 from medicamentos_tomas
                   where medicamento_id = 'aaaaaaaa-0000-0000-0000-000000000004'
                     and fecha = date '2026-10-10' and tomado_en = '2026-10-11T01:30:00Z') then
      raise exception 'FAIL: caso 4, no quedó la toma más reciente';
    end if;
    raise notice 'PASS: colisión desduplicada, queda la más reciente';

    -- El unique volvió a existir: insertar un duplicado debe fallar.
    begin
      insert into medicamentos_tomas (medicamento_id, usuario_id, fecha, tomado)
      values ('aaaaaaaa-0000-0000-0000-000000000002', o, '2026-10-10', true);
      raise exception 'FAIL: el unique (medicamento_id, fecha) no se restauró';
    exception when unique_violation then
      raise notice 'PASS: unique (medicamento_id, fecha) restaurado';
    end;
  end $$;
rollback;
