-- Vita — herramientas de memoria del chat (fase 2).
-- ESCRITA pero NO aplicada: aplicar a mano con `psql -1` (después de la 038) y registrar en supabase_migrations.schema_migrations.
-- Idempotente (create or replace). Sin transacción propia: se aplica con `psql -1`.
--
-- Cuatro funciones SECURITY INVOKER (corren con los permisos de quien llama, así que la RLS owner-only de 038
-- sigue siendo la autoridad; además cada una filtra por auth.uid() de forma explícita):
--   guardar_memoria      recordar / corregir en UNA transacción (el viejo vigente pasa a 'reemplazado' y el nuevo lo apunta).
--   deshacer_memoria     deshacer lo recién guardado: queda 'borrado' sin texto y, si corregía, el anterior vuelve a 'vigente'.
--   buscar_memoria       búsqueda de texto en español (websearch_to_tsquery) sobre recuerdos y mensajes, rankeada.
--                        Nunca devuelve mensajes con `excluido_memoria = true` ni recuerdos borrados.
--   sumar_uso_memorias   suma 1 a `usos` de los recuerdos devueltos (best effort desde la app).
-- Sin esta migración la app degrada: usa los mismos pasos en dos tiempos desde el servidor (guardar/deshacer) y
-- el filtro de texto de PostgREST (buscar, también filtrando `excluido_memoria`), sin ranking ni conteo de usos.
-- Convención del repo: en funciones con `returns table`, las columnas de salida llevan prefijo `o_` y toda
-- referencia a una columna va calificada con alias, para evitar "column reference is ambiguous".

-- ---------------------------------------------------------------------------
-- guardar_memoria
-- ---------------------------------------------------------------------------
create or replace function guardar_memoria(
  p_sobre_tipo text,
  p_sobre_perfil_id uuid,
  p_sobre_nombre text,
  p_clave text,
  p_texto text,
  p_tipo text,
  p_vence_at timestamptz,
  p_mensaje_origen_id uuid default null,
  p_origen text default 'chat'
)
returns table (o_id uuid, o_corrige_id uuid, o_texto_anterior text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sobre text;
  v_viejo_id uuid;
  v_viejo_texto text;
  v_nuevo_id uuid;
  v_intento int;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  -- Misma expresión que el índice único idx_memorias_un_vigente.
  v_sobre := case
    when p_sobre_tipo = 'yo' then 'yo'
    when p_sobre_perfil_id is not null then 'perfil:' || p_sobre_perfil_id::text
    else 'nombre:' || lower(coalesce(p_sobre_nombre, ''))
  end;

  -- Si otra transacción crea el vigente justo en el medio, el índice único frena el insert: se reintenta
  -- (el `for update` ya va a ver el vigente nuevo y lo reemplaza).
  for v_intento in 1..3 loop
    begin
      v_viejo_id := null;
      v_viejo_texto := null;

      select m.id, m.texto
        into v_viejo_id, v_viejo_texto
        from memorias m
       where m.usuario_id = v_uid
         and m.estado = 'vigente'
         and m.clave = p_clave
         and (case
                when m.sobre_tipo = 'yo' then 'yo'
                when m.sobre_perfil_id is not null then 'perfil:' || m.sobre_perfil_id::text
                else 'nombre:' || lower(coalesce(m.sobre_nombre, ''))
              end) = v_sobre
       for update;

      if v_viejo_id is not null then
        update memorias m
           set estado = 'reemplazado', updated_at = now()
         where m.id = v_viejo_id;
      end if;

      insert into memorias as m (
        usuario_id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, vence_at,
        corrige_id, origen, mensaje_origen_id
      )
      values (
        v_uid, p_sobre_tipo, p_sobre_perfil_id, p_sobre_nombre, p_clave, p_texto, p_tipo,
        case when p_tipo = 'pasajero' then p_vence_at else null end,
        v_viejo_id, case when p_origen = 'usuario' then 'usuario' else 'chat' end, p_mensaje_origen_id
      )
      returning m.id into v_nuevo_id;

      return query select v_nuevo_id, v_viejo_id, v_viejo_texto;
      return;
    exception when unique_violation then
      null; -- el bloque se deshace entero (incluido el update del viejo) y se reintenta
    end;
  end loop;

  raise exception 'no se pudo guardar el recuerdo' using errcode = '40001';
end;
$$;

-- ---------------------------------------------------------------------------
-- deshacer_memoria
-- ---------------------------------------------------------------------------
create or replace function deshacer_memoria(p_id uuid)
returns table (o_deshecho boolean, o_restaurado_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_corrige uuid;
  v_hallado uuid;
  v_restaurado uuid := null;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  -- El recuerdo queda borrado SIN texto (solo la marca). Solo si sigue vigente: si ya lo reemplazó otro, no se toca.
  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.id = p_id and m.usuario_id = v_uid and m.estado = 'vigente'
  returning m.id, m.corrige_id into v_hallado, v_corrige;

  if v_hallado is null then
    return query select false, null::uuid;
    return;
  end if;

  -- Si corregía a otro, el anterior vuelve a ser el vigente (el índice único no se viola: el nuevo ya no es vigente).
  if v_corrige is not null then
    update memorias m
       set estado = 'vigente', updated_at = now()
     where m.id = v_corrige and m.usuario_id = v_uid and m.estado = 'reemplazado'
    returning m.id into v_restaurado;
  end if;

  return query select true, v_restaurado;
end;
$$;

-- ---------------------------------------------------------------------------
-- buscar_memoria
-- ---------------------------------------------------------------------------
create or replace function buscar_memoria(
  p_consulta text,
  p_sobre_tipo text default null,
  p_sobre_perfil_id uuid default null,
  p_sobre_nombre text default null,
  p_desde date default null,
  p_hasta date default null,
  p_limite int default 6
)
returns table (
  o_fuente text,
  o_id uuid,
  o_fecha timestamptz,
  o_rank real,
  o_clave text,
  o_sobre_tipo text,
  o_sobre_perfil_id uuid,
  o_sobre_nombre text,
  o_estado text,
  o_tipo text,
  o_texto text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q tsquery;
  v_limite int := least(greatest(coalesce(p_limite, 6), 1), 10);
  v_desde timestamptz := case when p_desde is null then null else p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires' end;
  v_hasta timestamptz := case when p_hasta is null then null else (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires' end;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  v_q := websearch_to_tsquery('spanish', coalesce(p_consulta, ''));
  if v_q is null or numnode(v_q) = 0 then
    return;
  end if;

  return query
  with rec as (
    -- Vigentes y reemplazados (para contestar "¿antes venía otro día?"); los borrados no tienen texto ni se buscan.
    select m.id, m.created_at, ts_rank_cd(m.busqueda, v_q) as puntaje, m.clave, m.sobre_tipo, m.sobre_perfil_id,
           m.sobre_nombre, m.estado, m.tipo, m.texto
      from memorias m
     where m.usuario_id = v_uid
       and m.estado in ('vigente', 'reemplazado')
       and m.busqueda @@ v_q
       and (v_desde is null or m.created_at >= v_desde)
       and (v_hasta is null or m.created_at < v_hasta)
       and (
         p_sobre_tipo is null
         or (p_sobre_tipo = 'yo' and m.sobre_tipo = 'yo')
         or (p_sobre_tipo <> 'yo' and p_sobre_perfil_id is not null and m.sobre_perfil_id = p_sobre_perfil_id)
         or (p_sobre_tipo <> 'yo' and p_sobre_perfil_id is null and m.sobre_perfil_id is null
             and lower(coalesce(m.sobre_nombre, '')) = lower(coalesce(p_sobre_nombre, '')))
       )
     order by puntaje desc, m.created_at desc
     limit v_limite
  ),
  msg as (
    -- Mensajes originales, salvo los que la persona pidió dejar de recordar.
    select x.id, x.created_at, ts_rank_cd(x.busqueda, v_q) as puntaje, x.contenido
      from mensajes_chat x
     where x.usuario_id = v_uid
       and not x.excluido_memoria
       and x.busqueda @@ v_q
       and (v_desde is null or x.created_at >= v_desde)
       and (v_hasta is null or x.created_at < v_hasta)
     order by puntaje desc, x.created_at desc
     limit v_limite
  )
  select r.o_fuente, r.o_id, r.o_fecha, r.o_rank, r.o_clave, r.o_sobre_tipo, r.o_sobre_perfil_id,
         r.o_sobre_nombre, r.o_estado, r.o_tipo, r.o_texto
    from (
      select 'recuerdo'::text as o_fuente, c.id as o_id, c.created_at as o_fecha, c.puntaje::real as o_rank, c.clave as o_clave,
             c.sobre_tipo as o_sobre_tipo, c.sobre_perfil_id as o_sobre_perfil_id, c.sobre_nombre as o_sobre_nombre,
             c.estado as o_estado, c.tipo as o_tipo, c.texto as o_texto
        from rec c
      union all
      select 'mensaje'::text, d.id, d.created_at, d.puntaje::real, null::text, null::text, null::uuid, null::text, null::text, null::text,
             ts_headline('spanish', d.contenido, v_q, 'MaxWords=35, MinWords=10, MaxFragments=1, StartSel=«, StopSel=»')
        from msg d
    ) r
   order by r.o_rank desc, r.o_fecha desc
   limit v_limite;
end;
$$;

-- ---------------------------------------------------------------------------
-- sumar_uso_memorias
-- ---------------------------------------------------------------------------
create or replace function sumar_uso_memorias(p_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update memorias m
     set usos = m.usos + 1
   where m.id = any(p_ids) and m.usuario_id = auth.uid();
$$;

-- Solo usuarios con sesión; nada para anon.
revoke execute on function guardar_memoria(text, uuid, text, text, text, text, timestamptz, uuid, text) from public, anon;
revoke execute on function deshacer_memoria(uuid) from public, anon;
revoke execute on function buscar_memoria(text, text, uuid, text, date, date, int) from public, anon;
revoke execute on function sumar_uso_memorias(uuid[]) from public, anon;
grant execute on function guardar_memoria(text, uuid, text, text, text, text, timestamptz, uuid, text) to authenticated;
grant execute on function deshacer_memoria(uuid) to authenticated;
grant execute on function buscar_memoria(text, text, uuid, text, date, date, int) to authenticated;
grant execute on function sumar_uso_memorias(uuid[]) to authenticated;
