-- 056: droga del medicamento, aparte del nombre.
--
-- El nombre es lo que la persona conoce y lo que se muestra y se lee siempre
-- ("Forxiga"); la droga ("Dapagliflozina") es un dato de referencia que se ve
-- en letra chica (detalle, Mis medicamentos, resumen para el médico, export).
-- Se copia en todas las filas del medicamento, como `forma`. Null = sin cargar.
--
-- Se puede aplicar antes o después del código: sin la columna, la app guarda
-- el medicamento sin la droga y no muestra nada.

alter table medicamentos
  add column if not exists droga text
    check (droga is null or (length(btrim(droga)) between 1 and 80));

-- Resumen para el profesional: misma definición que 052, más la droga.
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
      -- 056: droga aparte del nombre (null si no se cargó).
      'droga', m.droga,
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
      'forma', m.forma,
      'pastillas_restantes', ip.stock
    )
    order by m.hora_programada, m.nombre
  ), '[]'::jsonb)
  into v_medicamentos
  from medicamentos m
  left join inventario_pastillas ip on ip.id = m.inventario_id
  where m.usuario_id = v_uid
    and (m.fecha_fin is null or v_hoy_ar <= m.fecha_fin);

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
        and (m.fecha_fin is null or dd.d <= m.fecha_fin)
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
