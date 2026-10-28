-- Solo lectura: lista las filas de public.medicamentos que harían fallar la
-- migración 040 (medicamentos_sin_horarios_duplicados). Funciona ANTES de
-- aplicarla: la normalización está inlineada y replica las funciones
-- medicamento_nombre_clave / medicamento_hora_clave / medicamento_dias_clave.
-- Ejecutar con psql contra la base a migrar; no modifica nada.
-- Devuelve ids y la hora guardada, sin nombres, para que el resultado se pueda
-- pegar en un ticket. Para resolverlos: editar la hora o los días, o borrar la
-- fila repetida, y volver a correr hasta que no devuelva filas.
--
-- tipo = 'incompatible': nombre vacío, hora fuera de H:MM / HH:MM / HH:MM:00 o
--   días con un valor distinto de lunes..domingo (el CHECK de 040 la rechaza).
-- tipo = 'duplicado': dos filas del mismo usuario con el mismo nombre
--   normalizado, la misma hora y algún día en común (el EXCLUDE de 040 las
--   rechaza). Sin días = todos los días. 'otra_fila' es la pareja.
with base as (
  select
    m.id,
    m.usuario_id,
    m.hora_programada,
    nullif(lower(btrim(regexp_replace(m.nombre,
      U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
      ' ', 'g'))), '') as nombre_clave,
    lower(btrim(regexp_replace(m.hora_programada,
      U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
      ' ', 'g'))) as hora_limpia,
    -- Índices de día 0..6; sin días equivale a toda la semana.
    case when cardinality(m.dias_recurrentes) = 0 then array[0,1,2,3,4,5,6]
      else array(
        select array_position(array['lunes','martes','miercoles','jueves','viernes','sabado','domingo'], d) - 1
        from unnest(m.dias_recurrentes) as d)
    end as dias_idx,
    (cardinality(m.dias_recurrentes) > 0 and exists (
      select 1 from unnest(m.dias_recurrentes) as d
      where d is null or d <> all (array['lunes','martes','miercoles','jueves','viernes','sabado','domingo'])
    )) or coalesce(array_ndims(m.dias_recurrentes), 1) <> 1 as dias_invalidos
  from public.medicamentos m
),
claves as (
  select
    id, usuario_id, hora_programada, nombre_clave, dias_idx, dias_invalidos,
    case when hora_limpia ~ '^(([0-9]|[01][0-9]|2[0-3]):[0-5][0-9]|([01][0-9]|2[0-3]):[0-5][0-9]:00)$'
      then split_part(hora_limpia, ':', 1)::integer * 60 + split_part(hora_limpia, ':', 2)::integer
    end as hora_min
  from base
)
select 'incompatible' as tipo, id, usuario_id, hora_programada, null::uuid as otra_fila
from claves
where nombre_clave is null or hora_min is null or dias_invalidos
union all
select 'duplicado', a.id, a.usuario_id, a.hora_programada, b.id
from claves a
join claves b
  on a.id < b.id
 and a.usuario_id = b.usuario_id
 and a.nombre_clave collate "C" = b.nombre_clave collate "C"
 and a.hora_min = b.hora_min
 and a.dias_idx && b.dias_idx
where a.nombre_clave is not null and a.hora_min is not null and not a.dias_invalidos
  and b.nombre_clave is not null and b.hora_min is not null and not b.dias_invalidos
order by tipo, usuario_id, id;
