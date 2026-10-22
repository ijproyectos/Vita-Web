-- Verifica la migración 026 (estudios.lugar). Correr con psql contra la DB
-- con la migración aplicada; todo en una transacción que se revierte.
begin;

do $$
declare
  existe boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estudios' and column_name = 'lugar'
  ) into existe;
  if not existe then
    raise exception 'FAIL: estudios.lugar no existe';
  end if;
  raise notice 'PASS: estudios.lugar existe';
end $$;

rollback;
