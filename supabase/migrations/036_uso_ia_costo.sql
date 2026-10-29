-- Nota: escrita pero NO aplicada. Aplicar a mano con psql (no `db push`) y registrar en schema_migrations.
-- Límite diario de IA en dólares (US$0,33/día = US$10/mes por usuario) con prompt caching.
--
-- Aditiva: agrega a uso_ia_diario (013) los tokens de cache y el costo acumulado en MICRO-dólares
-- (enteros; 1 USD = 1.000.000) para evitar deriva de floats. Las columnas viejas (tokens_input,
-- tokens_output, llamadas) se conservan y se siguen escribiendo. RLS sigue habilitada SIN policies
-- (solo service_role escribe/lee), igual que en 013: no se toca. No hay RPC ni función que cambiar:
-- `registrarUsoIA` hace select + upsert con el cliente service_role.
--
-- Sin esta migración la app degrada a las columnas de tokens con una estimación equivalente
-- (200.000 tokens ~ US$0,33), nunca falla.

alter table uso_ia_diario
  add column if not exists tokens_cache_lectura bigint not null default 0,
  add column if not exists tokens_cache_escritura bigint not null default 0,
  add column if not exists costo_micro_usd bigint not null default 0;
