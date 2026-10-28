-- Confirmaciones del chat (borrar / cambiar un horario) — tests para la migración 033.
--
-- Script psql a mano, mismo estilo que acciones-agente.sql: cada sección es una transacción
-- con ROLLBACK. Un run limpio imprime un `NOTICE: PASS: ...` por aserción.
--
-- Requisitos: migraciones 030 y 033 aplicadas y DOS cuentas reales (user_a, user_b).
--
-- Run:
--   psql "<pooler connection string>" \
--     -v user_a="'<uuid>'" -v user_b="'<uuid>'" \
--     -f supabase/tests/confirmaciones-agente.sql

\set ON_ERROR_STOP on

-- 1 — El índice parcial existe y los privilegios de 030 siguen recortados
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'idx_acciones_agente_pendientes' and tablename = 'acciones_agente') then
    raise exception 'FAIL: falta el índice parcial de pendientes';
  end if;
  raise notice 'PASS: índice parcial de pendientes';

  if not has_column_privilege('authenticated', 'acciones_agente', 'resultado', 'UPDATE') then
    raise exception 'FAIL: authenticated perdió UPDATE sobre resultado';
  end if;
  if has_column_privilege('authenticated', 'acciones_agente', 'clave', 'UPDATE')
     or has_column_privilege('authenticated', 'acciones_agente', 'created_at', 'UPDATE')
     or has_column_privilege('authenticated', 'acciones_agente', 'usuario_id', 'UPDATE')
     or has_column_privilege('authenticated', 'acciones_agente', 'pedido_id', 'UPDATE') then
    raise exception 'FAIL: authenticated puede actualizar columnas que no son resultado';
  end if;
  raise notice 'PASS: UPDATE sigue limitado a la columna resultado';
end $$;

-- 2 — El dueño crea una pendiente con el objetivo guardado, la lee y la consume (delete)
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into acciones_agente (usuario_id, pedido_id, clave, resultado)
  values (:user_a, 'cccccccc-0000-0000-0000-000000000001', 'pendiente:u~delete_schedule:losartan|',
    '{"pendiente":{"tool":"delete_schedule","input":{"medication_name":"Losartán"},"destinoId":"x","persona":"","sesionId":"s",
      "objetivo":{"medicamentoId":"m1","snapshot":{"id":"m1","nombre":"Losartán"},"texto":"¿Borro Losartán?"}}}');

  do $$
  declare n int; borradas int;
  begin
    select count(*) into n from acciones_agente
      where usuario_id = auth.uid() and clave like 'pendiente:%' and resultado->'pendiente'->'objetivo'->>'medicamentoId' = 'm1';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su pendiente con objetivo'; end if;
    raise notice 'PASS: pendiente con objetivo legible por el dueño';

    delete from acciones_agente where usuario_id = auth.uid() and clave like 'pendiente:%';
    get diagnostics borradas = row_count;
    if borradas <> 1 then raise exception 'FAIL: el dueño no pudo consumir/purgar su pendiente'; end if;
    raise notice 'PASS: purga de pendientes (un "no") borra la propia';
  end $$;
rollback;

-- 3 — Otro usuario no ve, no purga y no confirma pendientes ajenas
begin;
  insert into acciones_agente (usuario_id, pedido_id, clave, resultado)
  values (:user_a, 'cccccccc-0000-0000-0000-000000000002', 'pendiente:u~delete_schedule:x|', '{"pendiente":{"tool":"delete_schedule","input":{}}}');

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from acciones_agente where pedido_id = 'cccccccc-0000-0000-0000-000000000002';
    if n <> 0 then raise exception 'FAIL: otro usuario ve la pendiente ajena'; end if;
    delete from acciones_agente where pedido_id = 'cccccccc-0000-0000-0000-000000000002';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: otro usuario borró la pendiente ajena'; end if;
    raise notice 'PASS: pendientes aisladas por usuario (RLS)';
  end $$;
rollback;

-- 4 — El dueño no puede rejuvenecer una pendiente (created_at) ni moverla de usuario
begin;
  insert into acciones_agente (usuario_id, pedido_id, clave, created_at)
  values (:user_a, 'cccccccc-0000-0000-0000-000000000003', 'pendiente:u~delete_schedule:y|', now() - interval '1 hour');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  do $$
  begin
    begin
      update acciones_agente set created_at = now() where pedido_id = 'cccccccc-0000-0000-0000-000000000003';
      raise exception 'FAIL: el dueño rejuveneció una pendiente';
    exception when insufficient_privilege then
      raise notice 'PASS: created_at no se puede actualizar (privilegio por columna)';
    end;
  end $$;
rollback;
