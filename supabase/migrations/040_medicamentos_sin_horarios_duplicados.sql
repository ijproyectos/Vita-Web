-- Defensa para INSERT/UPDATE directos y RPC, incluida concurrencia.
-- SOLO preparar localmente: aplicación remota a cargo del dueño.
-- Requiere PostgreSQL >=14 (multiranges) y permiso para btree_gist.
-- Re-ejecutable: funciones con create or replace y constraints guardadas por
-- nombre. Si aborta por duplicados, listarlos con
-- supabase/queries/medicamentos-duplicados.sql (solo lectura), corregirlos y reintentar.
-- EXCLUDE no admite NOT VALID: bloqueo + preflight + índice son todo o nada.
-- Puede bloquear escrituras mientras construye el índice; planificar su aplicación.
begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- Mismo conjunto de blancos que ECMAScript /\s+/g y trim(), sin quitar
-- acentos/puntuación ni inferir marcas, dosis o equivalencias clínicas.
create or replace function public.medicamento_nombre_clave(valor text)
returns text language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  select nullif(lower(btrim(regexp_replace(valor,
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
    ' ', 'g'))), '');
$$;

-- La expresión no depende de DateStyle ni de casts de hora permisivos.
-- Solo H:MM, HH:MM o HH:MM:00, con trim exterior como JS.
-- NULL significa inválido (CHECK abajo).
create or replace function public.medicamento_hora_clave(valor text)
returns integer language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  select case when limpio ~ '^(([0-9]|[01][0-9]|2[0-3]):[0-5][0-9]|([01][0-9]|2[0-3]):[0-5][0-9]:00)$'
    then split_part(limpio, ':', 1)::integer * 60 + split_part(limpio, ':', 2)::integer
    else null end
  from (select public.medicamento_nombre_clave(valor) as limpio) normalizado;
$$;

create or replace function public.medicamento_dias_clave(valor text[])
returns int4multirange language plpgsql immutable strict parallel safe
set search_path = pg_catalog
as $$
declare
  dia text;
  indice integer;
  resultado int4multirange := '{}'::int4multirange;
begin
  if cardinality(valor) = 0 then return int4multirange(int4range(0, 7, '[)')); end if;
  if array_ndims(valor) <> 1 then return null; end if;
  foreach dia in array valor loop
    indice := array_position(array['lunes','martes','miercoles','jueves','viernes','sabado','domingo'], dia) - 1;
    if indice is null then return null; end if;
    resultado := resultado + int4multirange(int4range(indice, indice + 1, '[)'));
  end loop;
  return resultado;
end;
$$;

-- Las funciones solo transforman sus argumentos; no consultan filas ni elevan
-- privilegios. Mantener EXECUTE para authenticated permite evaluar el CHECK.
lock table public.medicamentos in access exclusive mode;

-- Diagnóstico sin PII. Para anticipar bloqueos se pueden ejecutar los SELECT
-- de conteos de este bloque en un entorno de ensayo con estos helpers.
-- No seleccionar nombres, usuario_id ni claves normalizadas en logs.
do $$
declare
  incompatibles bigint;
  pares_duplicados bigint;
begin
  select count(*) into incompatibles from public.medicamentos
  where public.medicamento_nombre_clave(nombre) is null
     or public.medicamento_hora_clave(hora_programada) is null
     or public.medicamento_dias_clave(dias_recurrentes) is null;
  if incompatibles > 0 then
    raise exception 'medicamentos: % filas incompatibles; resolver manualmente antes de reintentar', incompatibles
      using hint = 'Listarlas con supabase/queries/medicamentos-duplicados.sql (tipo = incompatible).';
  end if;

  select count(*) into pares_duplicados
  from public.medicamentos a join public.medicamentos b
    on a.id < b.id and a.usuario_id = b.usuario_id
    and public.medicamento_nombre_clave(a.nombre) collate "C" = public.medicamento_nombre_clave(b.nombre) collate "C"
    and public.medicamento_hora_clave(a.hora_programada) = public.medicamento_hora_clave(b.hora_programada)
    and public.medicamento_dias_clave(a.dias_recurrentes) && public.medicamento_dias_clave(b.dias_recurrentes);
  if pares_duplicados > 0 then
    raise exception 'medicamentos: % pares de horarios duplicados; resolver manualmente antes de reintentar', pares_duplicados
      using hint = 'Listarlos con supabase/queries/medicamentos-duplicados.sql (tipo = duplicado).';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'medicamentos_claves_validas' and conrelid = 'public.medicamentos'::regclass
  ) then
    alter table public.medicamentos
      add constraint medicamentos_claves_validas check (
        public.medicamento_nombre_clave(nombre) is not null
        and public.medicamento_hora_clave(hora_programada) is not null
        and public.medicamento_dias_clave(dias_recurrentes) is not null
      );
  end if;
end;
$$;

-- btree_gist puede existir en otro esquema: calificar sus opclasses desde
-- pg_extension evita depender del search_path del operador de la migración.
do $$
declare esquema text;
begin
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'medicamentos_sin_horarios_duplicados' and conrelid = 'public.medicamentos'::regclass
  ) then return; end if;
  select n.nspname into strict esquema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'btree_gist';
  execute format('alter table public.medicamentos
    add constraint medicamentos_sin_horarios_duplicados exclude using gist (
      usuario_id %1$I.gist_uuid_ops with =,
      (public.medicamento_nombre_clave(nombre) collate "C") %1$I.gist_text_ops with =,
      (public.medicamento_hora_clave(hora_programada)) %1$I.gist_int4_ops with =,
      (public.medicamento_dias_clave(dias_recurrentes)) with &&
    )', esquema);
end;
$$;

-- RLS y permisos de la tabla se conservan. Los clientes deben traducir 23P01
-- y el nombre de constraint; no exponer DETAIL del motor (contiene claves).
commit;
