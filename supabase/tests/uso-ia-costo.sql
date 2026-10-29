-- Verifica la migración 036 (uso_ia_diario con costo en micro-USD). Solo lectura de catálogo +
-- una transacción que se revierte. Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/uso-ia-costo.sql
begin;

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_name = 'uso_ia_diario'
     and column_name in ('tokens_cache_lectura', 'tokens_cache_escritura', 'costo_micro_usd')
     and data_type = 'bigint' and is_nullable = 'NO' and column_default = '0';
  if n <> 3 then raise exception 'FAIL: faltan columnas de 036 (%/3)', n; end if;
  raise notice 'PASS: columnas de 036 presentes (bigint not null default 0)';

  select count(*) into n from information_schema.columns
   where table_name = 'uso_ia_diario' and column_name in ('tokens_input', 'tokens_output', 'llamadas');
  if n <> 3 then raise exception 'FAIL: se perdieron columnas de 013'; end if;
  raise notice 'PASS: columnas de 013 conservadas';

  if not (select relrowsecurity from pg_class where oid = 'public.uso_ia_diario'::regclass) then
    raise exception 'FAIL: RLS deshabilitada en uso_ia_diario';
  end if;
  select count(*) into n from pg_policies where tablename = 'uso_ia_diario';
  if n <> 0 then raise exception 'FAIL: uso_ia_diario no debe tener policies (%)', n; end if;
  raise notice 'PASS: RLS habilitada sin policies';
end $$;

-- Un usuario autenticado no puede leer ni escribir la tabla.
set local role authenticated;
do $$
declare n int;
begin
  begin
    select count(*) into n from uso_ia_diario;
    if n <> 0 then raise exception 'FAIL: authenticated ve filas'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: authenticated no lee filas';
end $$;
reset role;

rollback;
