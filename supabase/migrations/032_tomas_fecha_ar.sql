-- Vitapp — Fase "fecha de tomas en hora argentina".
--
-- Escrita pero NO aplicada. Requisitos previos: 001 (medicamentos_tomas) y 015
-- (resumen_profesional). El código y esta migración tienen que salir JUNTOS:
-- el código nuevo (commit "fix(medicamentos): store tomas under the Argentine
-- date") escribe y lee `medicamentos_tomas.fecha` en hora AR; el código viejo
-- lo hacía en UTC.
--   - Aplicarla con el código viejo en producción: el código viejo vuelve a
--     grabar fechas UTC (entre 21:00 y 23:59 AR, un día adelantadas) sobre
--     filas ya migradas.
--   - Desplegar el código nuevo sin la migración: las tomas históricas quedan
--     en UTC (la adherencia y "hoy" de las últimas horas del día se desfasan
--     hasta migrar).
--   Orden sugerido: desplegar el código y aplicar esta migración enseguida.
--   Las tomas marcadas entre ambos pasos con el código nuevo ya están en AR y
--   el backfill las deja igual (usa `tomado_en`, que es el mismo instante),
--   salvo una dosis de AYER marcada entre las 00:00 y las 00:30 AR con la
--   tarjeta "Era ayer": su `tomado_en` ya es de hoy y el backfill la movería al
--   día siguiente. Por eso conviene aplicarla fuera de esa ventana.
--
-- Qué hace (todo en una transacción):
--   1. `medicamentos_tomas.fecha` pasa de "fecha UTC del momento de marcar" a
--      "fecha AR de la dosis":
--        - borra las filas con tomado = false (no guardan información: sin
--          fila equivale a "no tomada"; solo eran un desmarcado);
--        - para las tomadas con `tomado_en`: fecha = día AR de `tomado_en`;
--        - las tomadas sin `tomado_en` (no debería haber) conservan su fecha.
--      El unique (medicamento_id, fecha) se verifica fila por fila y no es
--      diferible, así que se suelta, se actualiza, se desduplica (por
--      medicamento y fecha queda la de `tomado_en` más reciente) y se vuelve a
--      crear con el mismo nombre.
--      Aproximación aceptada: una toma tardía marcada después de la
--      medianoche AR queda en el día siguiente, igual que antes.
--   2. `resumen_profesional` (015) usa "hoy" AR y el día AR de `created_at`.
--
-- Antes de aplicar, para ver qué se va a tocar (solo lectura):
--   select count(*) filter (where not tomado) as a_borrar,
--          count(*) filter (where tomado and tomado_en is not null
--            and fecha <> (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date) as a_mover
--   from medicamentos_tomas;
-- La migración emite además NOTICEs con esos conteos y los de duplicados.
--
-- RUNBOOK (aplicar por psql, nunca `supabase db push` a ciegas):
--   1. Ventana segura: fuera de 00:00-00:30 AR (ver arriba) y con el código
--      nuevo listo para desplegar enseguida.
--   2. Pre-flight (solo lectura), guardar la salida:
--        select count(*) as total,
--               count(*) filter (where not tomado) as a_borrar,
--               count(*) filter (where tomado and tomado_en is not null
--                 and fecha <> (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date) as a_mover
--        from medicamentos_tomas;
--   3. Backup (obligatorio, ANTES de aplicar; fuera de esta transacción):
--        create table medicamentos_tomas_bak_032 as select * from medicamentos_tomas;
--        alter table medicamentos_tomas_bak_032 enable row level security;
--      (sin policies: son datos de salud y la tabla queda en `public`, expuesta
--      a la API REST si no tiene RLS.) Verificar que su count coincide con 2.
--   4. Aplicar este archivo con `psql -v ON_ERROR_STOP=1 -f`. Es UNA sola
--      transacción (begin...commit): si cualquier sentencia falla (el chequeo
--      del DO, el unique al recrearse, etc.) TODO se revierte, DDL incluido, y
--      la tabla queda como estaba; se corrige y se reintenta. Una vez
--      confirmada NO volver a correrla a ciegas (el borrado de filas sin tomar
--      y el descarte de duplicados solo se recuperan desde el backup).
--      Registrarla a mano en supabase_migrations.schema_migrations.
--   5. Rollback (post-commit), con el código viejo desplegado y fuera de la
--      ventana:
--        begin;
--        lock table medicamentos_tomas in access exclusive mode;
--        alter table medicamentos_tomas drop constraint medicamentos_tomas_medicamento_id_fecha_key;
--        delete from medicamentos_tomas;
--        insert into medicamentos_tomas select * from medicamentos_tomas_bak_032;
--        alter table medicamentos_tomas
--          add constraint medicamentos_tomas_medicamento_id_fecha_key unique (medicamento_id, fecha);
--        commit;
--      y re-aplicar la definición de `resumen_profesional` de 015. Las tomas
--      marcadas después del backup se pierden con este rollback. Borrar el
--      backup (drop table medicamentos_tomas_bak_032) recién cuando todo esté
--      estable.

begin;

-- Que la app no escriba a mitad del backfill (bloqueo corto).
lock table medicamentos_tomas in access exclusive mode;

do $$
declare
  v_borrar int;
  v_mover int;
  v_colisiones int;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.medicamentos_tomas'::regclass
      and conname = 'medicamentos_tomas_medicamento_id_fecha_key'
  ) then
    raise exception 'No existe el unique medicamentos_tomas_medicamento_id_fecha_key: revisar el nombre antes de seguir';
  end if;

  select count(*) into v_borrar from medicamentos_tomas where not tomado;

  select count(*) into v_mover
  from medicamentos_tomas
  where tomado and tomado_en is not null
    and fecha <> (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date;

  -- Filas que sobrarán tras el backfill: más de una tomada para el mismo
  -- (medicamento, fecha AR). Se desduplican abajo.
  select coalesce(sum(n - 1), 0) into v_colisiones
  from (
    select count(*) as n
    from medicamentos_tomas
    where tomado
    group by medicamento_id,
             coalesce((tomado_en at time zone 'America/Argentina/Buenos_Aires')::date, fecha)
    having count(*) > 1
  ) c;

  raise notice '032: % filas sin tomar a borrar, % tomadas a mover de fecha, % duplicadas a descartar', v_borrar, v_mover, v_colisiones;
end $$;

-- Sin tomar = sin información.
delete from medicamentos_tomas where not tomado;

alter table medicamentos_tomas drop constraint medicamentos_tomas_medicamento_id_fecha_key;

update medicamentos_tomas
set fecha = (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date
where tomado
  and tomado_en is not null
  and fecha <> (tomado_en at time zone 'America/Argentina/Buenos_Aires')::date;

-- Por (medicamento, fecha) queda la toma más reciente.
delete from medicamentos_tomas t
using (
  select id,
         row_number() over (
           partition by medicamento_id, fecha
           order by tomado_en desc nulls last, created_at desc, id desc
         ) as rn
  from medicamentos_tomas
) d
where t.id = d.id and d.rn > 1;

alter table medicamentos_tomas
  add constraint medicamentos_tomas_medicamento_id_fecha_key unique (medicamento_id, fecha);

-- resumen_profesional ----------------------------------------------------------
-- Idéntica a la de 015 salvo: "hoy" y el alta del medicamento se miden en
-- fecha AR (antes UTC). Mismos grants y security definer.

create or replace function resumen_profesional(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_uid uuid;
  v_expira timestamptz;
  v_hoy_ar date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_dias text[] := array['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  v_perfil perfiles%rowtype;
  v_edad int;
  v_paciente jsonb;
  v_medicamentos jsonb;
  v_adherencia jsonb;
  v_turnos jsonb;
  v_estudios jsonb;
begin
  if p_token is null or length(p_token) = 0 or length(p_token) > 200 then
    return null;
  end if;

  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  update enlaces_profesional e
  set accesos = e.accesos + 1,
      ultimo_acceso_at = now()
  where e.token_hash = v_hash
    and e.revocado_at is null
    and e.expira_at > now()
  returning e.usuario_id, e.expira_at into v_uid, v_expira;

  if not found then
    return null;
  end if;

  select * into v_perfil from perfiles p where p.id = v_uid;

  if v_perfil.fecha_nacimiento is not null then
    v_edad := date_part('year', age(v_hoy_ar, v_perfil.fecha_nacimiento))::int;
  end if;

  v_paciente := jsonb_build_object(
    'nombre', nullif(split_part(btrim(coalesce(v_perfil.nombre, '')), ' ', 1), ''),
    'edad', v_edad,
    'edad_rango', case when v_edad is null then v_perfil.edad_rango else null end,
    'genero', v_perfil.genero,
    'grupo_sanguineo', v_perfil.grupo_sanguineo,
    'altura_cm', v_perfil.altura_cm,
    'peso_kg', v_perfil.peso_kg,
    'obra_social', v_perfil.obra_social
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'nombre', m.nombre,
      'dosis', m.dosis,
      'unidad', m.unidad,
      'hora', m.hora_programada,
      'momento', m.momento_dia,
      'dias', to_jsonb(m.dias_recurrentes),
      'con_comida', m.con_comida,
      'frecuencia', m.frecuencia,
      'duracion', m.duracion,
      'condicion', m.condicion,
      'notas', m.notas,
      -- Pastillas que quedan, solo si el medicamento tiene stock cargado.
      'pastillas_restantes', ip.stock
    )
    order by m.hora_programada, m.nombre
  ), '[]'::jsonb)
  into v_medicamentos
  from medicamentos m
  left join inventario_pastillas ip on ip.id = m.inventario_id
  where m.usuario_id = v_uid;

  -- Adherencia de los últimos 14 días: misma convención de fecha que la app
  -- (medicamentos_tomas.fecha es la fecha de Argentina desde 032) y misma
  -- regla de "aplica ese día" (dias_recurrentes vacío = todos los días).
  select jsonb_build_object(
    'dias', 14,
    'programadas', coalesce(sum(x.prog), 0),
    'tomadas', coalesce(sum(x.tom), 0),
    'porcentaje', case when coalesce(sum(x.prog), 0) = 0 then null
                       else round(100.0 * sum(x.tom) / sum(x.prog)) end,
    'por_dia', coalesce(jsonb_agg(
      jsonb_build_object('fecha', x.d, 'programadas', x.prog, 'tomadas', x.tom)
      order by x.d
    ), '[]'::jsonb)
  )
  into v_adherencia
  from (
    select
      dd.d,
      pr.prog,
      least(tm.tom, pr.prog) as tom
    from generate_series(0, 13) as g(n)
    cross join lateral (select v_hoy_ar - g.n as d) dd
    cross join lateral (
      select count(*)::int as prog
      from medicamentos m
      where m.usuario_id = v_uid
        and (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date <= dd.d
        and (
          cardinality(m.dias_recurrentes) = 0
          or v_dias[extract(isodow from dd.d)::int] = any (m.dias_recurrentes)
        )
    ) pr
    cross join lateral (
      select count(*)::int as tom
      from medicamentos_tomas t
      where t.usuario_id = v_uid and t.fecha = dd.d and t.tomado
    ) tm
  ) x;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'especialidad', s.especialidad,
      'profesional', s.profesional,
      'lugar', s.lugar,
      'fecha', s.fecha,
      'hora', s.hora,
      'motivo', s.motivo
    )
    order by s.fecha, s.hora
  ), '[]'::jsonb)
  into v_turnos
  from (
    select t.especialidad, t.profesional, t.lugar, t.fecha, t.hora, t.motivo
    from turnos t
    where t.usuario_id = v_uid and t.fecha >= v_hoy_ar
    order by t.fecha, t.hora
    limit 5
  ) s;

  -- Sin archivo_path / archivo_tipo / ids: nada que permita llegar a la imagen.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tipo', s.tipo,
      'fecha', s.fecha,
      'resumen', s.resumen,
      'valores', s.valores
    )
    order by s.fecha desc nulls last, s.created_at desc
  ), '[]'::jsonb)
  into v_estudios
  from (
    select e.tipo, e.fecha, e.resumen, e.valores, e.created_at
    from estudios e
    where e.usuario_id = v_uid and e.estado = 'listo'
    order by e.fecha desc nulls last, e.created_at desc
    limit 5
  ) s;

  return jsonb_build_object(
    'generado_en', now(),
    'vigente_hasta', v_expira,
    'paciente', v_paciente,
    'condiciones', coalesce(v_perfil.condiciones, '[]'::jsonb),
    'alergias', to_jsonb(coalesce(v_perfil.alergias, '{}'::text[])),
    'medicamentos', v_medicamentos,
    'adherencia', v_adherencia,
    'turnos', v_turnos,
    'estudios', v_estudios,
    'contacto_emergencia', jsonb_build_object(
      'nombre', v_perfil.contacto_emergencia_nombre,
      'telefono', v_perfil.contacto_emergencia_telefono
    )
  );
end;
$$;

revoke execute on function resumen_profesional(text) from public;
grant execute on function resumen_profesional(text) to anon, authenticated;

commit;
