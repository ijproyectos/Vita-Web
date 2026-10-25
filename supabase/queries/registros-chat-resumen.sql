-- Resumen de registros_chat, SOLO LECTURA (select). Correr con psql / SQL editor de Supabase (service role).
-- Día = calendario de Argentina, igual que el límite diario de IA.

-- 1) Por día, últimos 7 días: respuestas, errores y latencia p50/p95.
select
  (created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia,
  count(*) as respuestas,
  count(*) filter (where resultado = 'error') as errores,
  count(*) filter (where resultado = 'limite') as rechazos_por_limite,
  percentile_cont(0.5) within group (order by latencia_ms) filter (where resultado = 'ok') as p50_ms,
  percentile_cont(0.95) within group (order by latencia_ms) filter (where resultado = 'ok') as p95_ms,
  percentile_cont(0.5) within group (order by latencia_primer_token_ms) filter (where resultado = 'ok') as p50_primer_token_ms
from registros_chat
where created_at >= now() - interval '7 days'
group by 1
order by 1 desc;

-- 2) Errores por código.
select error_codigo, count(*) as veces
from registros_chat
where created_at >= now() - interval '7 days' and resultado = 'error'
group by 1
order by 2 desc;

-- 3) Tokens por modelo y versión del prompt (7 días).
select
  modelo,
  version_prompt,
  count(*) as respuestas,
  sum(tokens_entrada) as tokens_entrada,
  sum(tokens_salida) as tokens_salida,
  sum(tokens_cache_lectura) as tokens_cache_lectura,
  sum(tokens_cache_escritura) as tokens_cache_escritura,
  round(avg(vueltas_modelo), 2) as vueltas_promedio
from registros_chat
where created_at >= now() - interval '7 days'
group by 1, 2
order by 3 desc;

-- 4) Costo aproximado por día.
-- TODO: PRECIOS SIN VERIFICAR. No se inventaron: completar con los precios vigentes (USD por millón de
-- tokens) de https://docs.claude.com/en/docs/about-claude/pricing para cada modelo ANTES de confiar en
-- esta columna. Mientras sean null, usd_aprox da null (no 0).
with precios (modelo, usd_entrada_por_mtok, usd_salida_por_mtok, usd_cache_lectura_por_mtok, usd_cache_escritura_por_mtok) as (
  values
    ('claude-sonnet-5', null::numeric, null::numeric, null::numeric, null::numeric) -- TODO valores
)
select
  (r.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia,
  r.modelo,
  sum(r.tokens_entrada) as tokens_entrada,
  sum(r.tokens_salida) as tokens_salida,
  round((
    sum(r.tokens_entrada) * p.usd_entrada_por_mtok
    + sum(r.tokens_salida) * p.usd_salida_por_mtok
    + sum(r.tokens_cache_lectura) * p.usd_cache_lectura_por_mtok
    + sum(r.tokens_cache_escritura) * p.usd_cache_escritura_por_mtok
  ) / 1000000.0, 4) as usd_aprox
from registros_chat r
left join precios p on p.modelo = r.modelo
where r.created_at >= now() - interval '7 days'
group by 1, 2, p.usd_entrada_por_mtok, p.usd_salida_por_mtok, p.usd_cache_lectura_por_mtok, p.usd_cache_escritura_por_mtok
order by 1 desc, 2;
