-- Vitapp — "Compartir con profesional": link temporal de solo lectura con un
-- resumen de salud para mostrarle a un médico (/p/{token}, sin login).
--
-- Seguridad:
--   - El token crudo (32 bytes aleatorios, base64url) lo genera el servidor de
--     la app, se le muestra al dueño UNA vez dentro de la URL y NUNCA se
--     guarda: acá solo vive su sha256 en hex (`token_hash`).
--   - Nadie salvo el dueño tiene policy sobre la tabla (ni anon, ni otro
--     usuario, ni un cuidador). La lectura pública pasa por una única RPC
--     `security definer` que recibe el token, lo hashea y devuelve UN jsonb.
--   - Link inexistente / vencido / revocado => null, sin distinguir el caso.
--   - El resumen excluye email, historial de chat, datos de cuidadores, ids y
--     paths de archivos. Solo incluye lo que un profesional necesita.
--   - El hash usa `sha256()` nativo de Postgres (11+), sin depender de
--     pgcrypto ni de en qué schema quedó instalada la extensión.
--
-- Esta migración está escrita pero NO aplicada todavía.

create table enlaces_profesional (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique, -- sha256 hex del token; el token crudo no se guarda
  etiqueta text, -- ej. "Dra. Pérez"; solo la ve el dueño
  expira_at timestamptz not null,
  revocado_at timestamptz,
  created_at timestamptz not null default now(),
  ultimo_acceso_at timestamptz,
  accesos int not null default 0
);

create index idx_enlaces_profesional_usuario on enlaces_profesional (usuario_id, created_at desc);

alter table enlaces_profesional enable row level security;

create policy enlaces_profesional_all_self on enlaces_profesional
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Defensa en profundidad: aunque no exista policy para anon, tampoco tiene
-- privilegio de tabla (Supabase suele otorgarlo por default privileges).
revoke all on enlaces_profesional from anon;

-- RPC pública ----------------------------------------------------------------

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
  v_hoy_utc date := (now() at time zone 'utc')::date;
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
  -- (medicamentos_tomas.fecha se graba en UTC) y misma regla de "aplica ese
  -- día" (dias_recurrentes vacío = todos los días).
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
    cross join lateral (select v_hoy_utc - g.n as d) dd
    cross join lateral (
      select count(*)::int as prog
      from medicamentos m
      where m.usuario_id = v_uid
        and (m.created_at at time zone 'utc')::date <= dd.d
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
