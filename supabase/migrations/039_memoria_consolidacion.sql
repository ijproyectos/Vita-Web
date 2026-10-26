-- Vita — limpieza nocturna de la memoria: consolidación con Batch API (M7).
-- ESCRITA pero NO aplicada: aplicar a mano con psql (después de 035–038) y registrar en supabase_migrations.schema_migrations.
--
-- NO aplicar tal cual: el placeholder `<CRON_SECRET_VALUE>` se reemplaza a mano, solo en el archivo local, por el valor REAL
-- de CRON_SECRET (el mismo que tiene Netlify) justo antes de aplicar. Nunca commitear el valor real.
-- Requisitos previos: 035–038 aplicadas, la ruta /api/cron/memoria-consolidacion deployada y CRON_SECRET /
-- SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY cargadas en Netlify.
-- Rollback de los jobs: select cron.unschedule('memoria-consolidacion-enviar'); select cron.unschedule('memoria-consolidacion-procesar');
--
-- Qué hace (la lógica de cada paso vive en lib/memoria/consolidacion{,-logica}.ts):
--   1) Una vez por día (~04:00 AR) el servidor manda UN lote (Message Batches, claude-haiku-5-5) con los recuerdos vigentes
--      estables de cada persona con memoria activa cuyos recuerdos cambiaron desde su última consolidación. Nunca viaja texto
--      de mensajes del chat, solo recuerdos.
--   2) Cada 15 min se consulta el lote; cuando terminó, el resultado de cada persona se aplica con `aplicar_consolidacion`,
--      en UNA transacción que vuelve a verificar que cada recuerdo citado siga vigente y sin cambios desde la foto (snapshot)
--      que se mandó al modelo. Lo que cambió o se borró mientras corría el lote se saltea: un recuerdo borrado no revive.
--   3) Los pasajeros vencidos pasan a 'vencido' (sin texto) con `marcar_pasajeros_vencidos`.
--
-- Estado 'vencido': un pasajero cuyo `vence_at` ya pasó. Se le quita el texto (como al borrado: ya no sirve ni se busca, y
-- no tiene sentido conservar un "hoy estoy triste" de hace una semana). Libera la clave del índice de un solo vigente.
--
-- `reemplazada_por_id`: el recuerdo que reemplazó a este por una unión de duplicados (consolidación) o porque la persona
-- eligió el otro en una contradicción. Es el puntero que usan "dejar de recordar / eliminar" para alcanzar también las
-- versiones que se unieron (ver olvidar_memoria, redefinida abajo) y el trigger de cascada.
--
-- Convención del repo: en funciones con `returns table`, las columnas de salida llevan prefijo `o_` y toda referencia a una
-- columna va calificada con alias.

begin;

-- ---------------------------------------------------------------------------
-- memorias: estado 'vencido' y puntero de reemplazo
-- ---------------------------------------------------------------------------
alter table memorias drop constraint if exists memorias_estado_check;
alter table memorias add constraint memorias_estado_check check (estado in ('vigente', 'reemplazado', 'borrado', 'vencido'));

alter table memorias drop constraint if exists memorias_texto_si_no_borrado;
alter table memorias add constraint memorias_texto_si_no_borrado
  check (estado in ('borrado', 'vencido') or (texto is not null and texto <> ''));
alter table memorias drop constraint if exists memorias_borrado_sin_texto;
alter table memorias add constraint memorias_borrado_sin_texto
  check (estado not in ('borrado', 'vencido') or texto is null or texto = '');

alter table memorias add column reemplazada_por_id uuid references memorias(id) on delete set null;
create index idx_memorias_reemplazada_por on memorias (reemplazada_por_id) where reemplazada_por_id is not null;

-- ---------------------------------------------------------------------------
-- lotes_consolidacion / lote_usuarios: seguimiento de los lotes de Batch
-- ---------------------------------------------------------------------------
-- Sin policies, a propósito: es registro de sistema, solo service_role (el trabajador). No guardan texto de recuerdos:
-- `snapshot` es la lista ORDENADA [{id, u}] de lo que se mandó (u = updated_at tal cual); la referencia "m3" que ve el
-- modelo es la posición 3 de esa lista.
create table lotes_consolidacion (
  id uuid primary key default gen_random_uuid(),
  batch_id text unique,  -- id del lote en Anthropic; null hasta que se crea
  estado text not null default 'enviado' check (estado in ('enviado', 'terminado', 'aplicado', 'fallido')),
  usuarios int not null default 0 check (usuarios >= 0),
  created_at timestamptz not null default now(),
  terminado_at timestamptz,  -- cuándo se reclamó para aplicar (también sirve de reserva vencible)
  intentos int not null default 0 check (intentos >= 0), -- reclamos para aplicar: tope para que un lote atascado no reintente para siempre
  error text                 -- código corto, nunca el mensaje crudo
);
create index idx_lotes_consolidacion_estado on lotes_consolidacion (estado, created_at);

create table lote_usuarios (
  lote_id uuid not null references lotes_consolidacion(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  custom_id text not null,
  snapshot jsonb not null,
  estado text not null default 'enviado' check (estado in ('enviado', 'aplicado', 'error', 'omitido')),
  created_at timestamptz not null default now(), -- momento de la foto: "consolidado hasta" para elegir candidatos
  aplicado_at timestamptz,
  intentos int not null default 0 check (intentos >= 0), -- fallas transitorias al aplicar a esta persona
  detalle jsonb,  -- solo conteos
  error text,
  primary key (lote_id, usuario_id),
  unique (lote_id, custom_id)
);
-- Una persona no puede estar en dos lotes en vuelo: es la guarda contra dos envíos simultáneos.
create unique index idx_lote_usuarios_un_enviado on lote_usuarios (usuario_id) where estado = 'enviado';
create index idx_lote_usuarios_aplicado on lote_usuarios (usuario_id, created_at) where estado = 'aplicado';

alter table lotes_consolidacion enable row level security;
alter table lote_usuarios enable row level security;

-- ---------------------------------------------------------------------------
-- contradicciones_memoria: pares vigentes que parecen contradecirse (la persona decide)
-- ---------------------------------------------------------------------------
create table contradicciones_memoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  memoria_a uuid not null references memorias(id) on delete cascade,
  memoria_b uuid not null references memorias(id) on delete cascade,
  -- Pregunta corta y neutral para la persona. Se vacía al cerrarse la contradicción (no queda texto derivado).
  pregunta text not null default '' check (char_length(pregunta) <= 300),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelta', 'descartada')),
  preguntada_at timestamptz,  -- última vez que vita la tuvo delante para preguntar (no se repite todo el tiempo)
  veces_preguntada int not null default 0 check (veces_preguntada >= 0),
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  -- Par canónico (a < b): el mismo par no se marca dos veces aunque el modelo lo nombre al revés.
  constraint contradicciones_par_ordenado check (memoria_a < memoria_b)
);
-- Un par se marca UNA vez en la vida (también si la persona dijo "valen las dos": no se vuelve a preguntar).
create unique index idx_contradicciones_par on contradicciones_memoria (memoria_a, memoria_b);
create index idx_contradicciones_pendientes on contradicciones_memoria (usuario_id, created_at) where estado = 'pendiente';

alter table contradicciones_memoria enable row level security;
-- Solo el dueño lee y actualiza; no inserta ni borra (eso es del trabajador, con service_role). Sin policies de cuidador.
create policy contradicciones_select_self on contradicciones_memoria for select using (usuario_id = auth.uid());
create policy contradicciones_update_self on contradicciones_memoria for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
-- Y del update, solo lo que la app necesita (cerrarla y la marca de "ya se la pregunté"); resolver_contradiccion es invoker.
revoke update on contradicciones_memoria from authenticated, anon;
grant update (estado, pregunta, resuelta_at, preguntada_at, veces_preguntada) on contradicciones_memoria to authenticated;

-- ---------------------------------------------------------------------------
-- Cascada de estado (trigger)
-- ---------------------------------------------------------------------------
-- 1) Un recuerdo que deja de estar vigente cierra las contradicciones pendientes que lo mencionan (y borra su pregunta).
-- 2) Un recuerdo que queda 'borrado' arrastra a los que él reemplazó (sus versiones unidas / perdedoras: 'reemplazado'
--    conserva texto) y, si salió de una unión de consolidación, a la unión (una unión nunca sobrevive a que se borre un
--    ingrediente: un dato olvidado no puede seguir vivo dentro de un recuerdo unido).
-- Corre por fila, en la misma transacción, también cuando el borrado viene de las funciones de 038 o de la app sin RPC.
create or replace function memorias_cascada_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = 'vigente' and new.estado <> 'vigente' then
    update contradicciones_memoria c
       set estado = 'descartada', pregunta = '', resuelta_at = now()
     where c.usuario_id = new.usuario_id
       and c.estado = 'pendiente'
       and (c.memoria_a = new.id or c.memoria_b = new.id);
  end if;

  if new.estado = 'borrado' then
    update memorias m
       set estado = 'borrado', texto = null, destacado = false, updated_at = now()
     where m.usuario_id = new.usuario_id and m.reemplazada_por_id = new.id and m.estado <> 'borrado';

    if new.reemplazada_por_id is not null then
      update memorias m
         set estado = 'borrado', texto = null, destacado = false, updated_at = now()
       where m.id = new.reemplazada_por_id and m.usuario_id = new.usuario_id
         and m.estado <> 'borrado' and m.origen = 'consolidacion';
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_memorias_cascada_estado
  after update of estado on memorias
  for each row
  when (old.estado is distinct from new.estado)
  execute function memorias_cascada_estado();

-- ---------------------------------------------------------------------------
-- marcar_pasajeros_vencidos (service_role)
-- ---------------------------------------------------------------------------
-- Pasajero vigente cuyo vence_at ya pasó -> 'vencido' y sin texto. No toca updated_at: que un pasajero venza no es un
-- cambio que amerite volver a consolidar a la persona. Idempotente. Devuelve cuántos archivó.
create or replace function marcar_pasajeros_vencidos()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
begin
  update memorias m
     set estado = 'vencido', texto = null, destacado = false
   where m.estado = 'vigente' and m.tipo = 'pasajero' and m.vence_at is not null and m.vence_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- candidatos_consolidacion (service_role)
-- ---------------------------------------------------------------------------
-- Personas con memoria activa, al menos p_minimo recuerdos estables vigentes, y algún vigente que cambió DESPUÉS de la foto
-- de su última consolidación aplicada (o nunca consolidada). Sin las que ya están en un lote en vuelo. Las más activas primero.
create or replace function candidatos_consolidacion(p_limite int default 100, p_minimo int default 3)
returns table (o_usuario_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.usuario_id
    from memorias m
    join perfiles p on p.id = m.usuario_id and p.memoria_activa
   where m.estado = 'vigente' and m.tipo = 'estable' and m.texto is not null
     and not exists (select 1 from lote_usuarios e where e.usuario_id = m.usuario_id and e.estado = 'enviado')
   group by m.usuario_id
  having count(*) >= greatest(coalesce(p_minimo, 3), 2)
     and max(m.updated_at) > coalesce(
           (select max(a.created_at) from lote_usuarios a where a.usuario_id = m.usuario_id and a.estado = 'aplicado'),
           '-infinity'::timestamptz)
   order by max(m.updated_at) desc
   limit least(greatest(coalesce(p_limite, 100), 1), 500);
$$;

-- ---------------------------------------------------------------------------
-- reservar_lote_consolidacion (service_role)
-- ---------------------------------------------------------------------------
-- Crea el lote y reserva a cada persona ANTES de llamar a Anthropic. p_usuarios = [{usuario_id, custom_id, snapshot}].
-- El índice único parcial deja a cada persona en un solo lote en vuelo: si dos envíos corren a la vez, cada persona la
-- gana uno solo. Devuelve las personas reservadas (cero filas = nada para mandar, y no deja lote).
create or replace function reservar_lote_consolidacion(p_usuarios jsonb)
returns table (o_lote_id uuid, o_usuario_id uuid, o_custom_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote uuid;
  v_item jsonb;
  v_n int := 0;
  v_filas int;
begin
  if p_usuarios is null or jsonb_typeof(p_usuarios) <> 'array' or jsonb_array_length(p_usuarios) = 0 then
    return;
  end if;

  insert into lotes_consolidacion default values returning id into v_lote;

  for v_item in select e from jsonb_array_elements(p_usuarios) e loop
    insert into lote_usuarios (lote_id, usuario_id, custom_id, snapshot)
    values (v_lote, (v_item ->> 'usuario_id')::uuid, v_item ->> 'custom_id', v_item -> 'snapshot')
    on conflict (usuario_id) where estado = 'enviado' do nothing;
    get diagnostics v_filas = row_count;
    v_n := v_n + v_filas;
  end loop;

  if v_n = 0 then
    delete from lotes_consolidacion l where l.id = v_lote;
    return;
  end if;

  update lotes_consolidacion l set usuarios = v_n where l.id = v_lote;
  return query select u.lote_id, u.usuario_id, u.custom_id from lote_usuarios u where u.lote_id = v_lote;
end;
$$;

-- ---------------------------------------------------------------------------
-- aplicar_consolidacion (service_role)
-- ---------------------------------------------------------------------------
-- Aplica el plan de UNA persona en una sola transacción. Garantías:
--   * Idempotente: se bloquea la fila de lote_usuarios y solo actúa si sigue 'enviado'. Un segundo intento (otro poll)
--     devuelve 'ya_aplicado' sin tocar nada.
--   * Plan viejo = se saltea: cada recuerdo citado debe seguir 'vigente', estable, con texto y con el mismo `updated_at`
--     que tenía en la foto (p_snapshot = {id: updated_at}); se leen con FOR UPDATE, así que un cambio concurrente también
--     se detecta. Si algo no cumple, ESE ítem se omite (los demás siguen). Un borrado, corregido o vencido nunca revive: ni
--     se une, ni se destaca, ni entra en una contradicción. Los mensajes del chat no se leen ni se usan acá.
--   * Cada ítem corre en su propio sub-bloque: si falla (clave repetida, check), se deshace solo ese ítem.
-- Plan (jsonb, ids reales ya validados contra la foto en el servidor):
--   { unir: [{ids: [uuid], texto, clave}], destacados: [uuid], contradicciones: [{a, b, pregunta}] }
-- Destacados: solo estables; tope de cantidad y de tokens (~4 caracteres por token, igual que lib/memoria/contexto.ts).
-- Una lista de destacados vacía NO quita los que ya hay (una respuesta vacía del modelo no es una decisión).
create or replace function aplicar_consolidacion(
  p_lote uuid,
  p_usuario uuid,
  p_plan jsonb,
  p_snapshot jsonb,
  p_max_destacados int default 8,
  p_max_tokens_destacados int default 1000
)
returns table (o_estado text, o_unidos int, o_destacados int, o_contradicciones int, o_omitidos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lu lote_usuarios%rowtype;
  v_activa boolean;
  v_item jsonb;
  v_ids uuid[];
  v_ok uuid[];
  v_sobres int;
  v_ref memorias%rowtype;
  v_algun_destacado boolean;
  v_usos int;
  v_nuevo uuid;
  v_texto text;
  v_clave text;
  v_unidos int := 0;
  v_omitidos int := 0;
  v_contr int := 0;
  v_filas int;
  v_heredan uuid[] := '{}';
  v_elegidos uuid[] := '{}';
  v_candidatos uuid[] := '{}';
  v_cand uuid;
  v_tokens int;
  v_tokens_total int := 0;
  v_a uuid;
  v_b uuid;
  v_pregunta text;
  v_pendientes int;
  v_hay_plan_destacados boolean;
begin
  select u.* into v_lu from lote_usuarios u where u.lote_id = p_lote and u.usuario_id = p_usuario for update;
  if not found then
    return query select 'sin_lote'::text, 0, 0, 0, 0;
    return;
  end if;
  if v_lu.estado <> 'enviado' then
    return query select 'ya_aplicado'::text, 0, 0, 0, 0;
    return;
  end if;

  select p.memoria_activa into v_activa from perfiles p where p.id = p_usuario;
  if v_activa is distinct from true then
    update lote_usuarios u set estado = 'omitido', error = 'memoria_apagada', aplicado_at = clock_timestamp()
     where u.lote_id = p_lote and u.usuario_id = p_usuario;
    return query select 'memoria_apagada'::text, 0, 0, 0, 0;
    return;
  end if;

  -- ---- 1) Unir duplicados ----
  for v_item in select e from jsonb_array_elements(coalesce(p_plan -> 'unir', '[]'::jsonb)) e loop
    begin
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_item -> 'ids') x;
      v_texto := btrim(coalesce(v_item ->> 'texto', ''));
      v_clave := coalesce(v_item ->> 'clave', '');
      if v_ids is null or cardinality(v_ids) < 2 or cardinality(v_ids) > 6
         or cardinality(v_ids) <> (select count(distinct i) from unnest(v_ids) i)
         or char_length(v_texto) < 1 or char_length(v_texto) > 200
         or v_clave !~ '^[a-z0-9_]{1,48}$' then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;

      select array_agg(s.id) into v_ok from (
        select m.id
          from memorias m
         where m.usuario_id = p_usuario and m.id = any(v_ids)
           and m.estado = 'vigente' and m.tipo = 'estable' and m.texto is not null
           and m.updated_at = case when p_snapshot ->> m.id::text is null then null else (p_snapshot ->> m.id::text)::timestamptz end
           for update
      ) s;
      if v_ok is null or cardinality(v_ok) <> cardinality(v_ids) then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;

      -- Todos sobre la misma persona (misma expresión que el índice único de 035).
      select count(distinct (case
                               when m.sobre_tipo = 'yo' then 'yo'
                               when m.sobre_perfil_id is not null then 'perfil:' || m.sobre_perfil_id::text
                               else 'nombre:' || lower(coalesce(m.sobre_nombre, ''))
                             end)),
             bool_or(m.destacado), coalesce(sum(m.usos), 0)
        into v_sobres, v_algun_destacado, v_usos
        from memorias m where m.id = any(v_ok);
      if v_sobres <> 1 then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;

      select m.* into v_ref from memorias m where m.id = any(v_ok) order by m.updated_at desc, m.id limit 1;

      -- Primero los viejos pasan a 'reemplazado' (libera la clave), después nace el unido. No se usa corrige_id:
      -- "deshacer" nunca podría resucitar un ingrediente.
      update memorias m set estado = 'reemplazado', destacado = false where m.id = any(v_ok);

      insert into memorias as m (usuario_id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, origen, usos, updated_at)
      values (p_usuario, v_ref.sobre_tipo, v_ref.sobre_perfil_id, v_ref.sobre_nombre, v_clave, v_texto, 'estable',
              'consolidacion', least(v_usos, 1000000), v_lu.created_at)
      returning m.id into v_nuevo;

      update memorias m set reemplazada_por_id = v_nuevo where m.id = any(v_ok);
      if v_algun_destacado then
        v_heredan := v_heredan || v_nuevo;
      end if;
      v_unidos := v_unidos + 1;
    exception when unique_violation or check_violation or invalid_text_representation or foreign_key_violation then
      -- El sub-bloque se deshace entero (los viejos vuelven a vigente) y el ítem se cuenta como omitido.
      v_omitidos := v_omitidos + 1;
    end;
  end loop;

  -- ---- 2) Destacados (solo estables, con tope de cantidad y de tokens) ----
  v_hay_plan_destacados := jsonb_array_length(coalesce(p_plan -> 'destacados', '[]'::jsonb)) > 0;
  if v_hay_plan_destacados then
    select coalesce(array_agg(c.id order by c.ord), '{}') into v_candidatos from (
      select case when t.x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t.x::uuid end as id, t.ord
        from jsonb_array_elements_text(p_plan -> 'destacados') with ordinality as t(x, ord)
    ) c where c.id is not null;
  end if;
  v_candidatos := v_candidatos || v_heredan;

  foreach v_cand in array v_candidatos loop
    exit when cardinality(v_elegidos) >= greatest(coalesce(p_max_destacados, 8), 0);
    continue when v_cand = any(v_elegidos);
    select (ceil(char_length(m.texto) / 4.0)::int + 1) into v_tokens
      from memorias m
     where m.id = v_cand and m.usuario_id = p_usuario and m.estado = 'vigente' and m.tipo = 'estable' and m.texto is not null
       and (v_cand = any(v_heredan)
            or m.updated_at = case when p_snapshot ->> m.id::text is null then null else (p_snapshot ->> m.id::text)::timestamptz end);
    continue when v_tokens is null;
    if v_tokens_total + v_tokens > coalesce(p_max_tokens_destacados, 1000) then
      continue;
    end if;
    v_tokens_total := v_tokens_total + v_tokens;
    v_elegidos := v_elegidos || v_cand;
    v_tokens := null;
  end loop;

  if v_hay_plan_destacados or cardinality(v_heredan) > 0 then
    if cardinality(v_elegidos) > 0 then
      -- Los destacados anteriores que estaban en la foto y no cambiaron dejan de serlo si el plan eligió otros.
      update memorias m set destacado = false
       where m.usuario_id = p_usuario and m.estado = 'vigente' and m.destacado and not (m.id = any(v_elegidos))
         and m.updated_at = case when p_snapshot ->> m.id::text is null then null else (p_snapshot ->> m.id::text)::timestamptz end;
      update memorias m set destacado = true
       where m.usuario_id = p_usuario and m.estado = 'vigente' and m.tipo = 'estable' and m.id = any(v_elegidos) and not m.destacado;
    end if;
  end if;

  -- ---- 3) Contradicciones (se marcan, no se deciden) ----
  -- Una contradicción que ya se preguntó 3 veces sin respuesta (y cuya última ventana de 30 min pasó) se descarta: así no ocupa
  -- el cupo de 5 pendientes y las nuevas se pueden marcar. El par queda marcado para siempre (no se vuelve a preguntar).
  update contradicciones_memoria c
     set estado = 'descartada', pregunta = '', resuelta_at = now()
   where c.usuario_id = p_usuario and c.estado = 'pendiente'
     and c.veces_preguntada >= 3 and c.preguntada_at < now() - interval '30 minutes';
  select count(*) into v_pendientes from contradicciones_memoria c where c.usuario_id = p_usuario and c.estado = 'pendiente';
  for v_item in select e from jsonb_array_elements(coalesce(p_plan -> 'contradicciones', '[]'::jsonb)) e loop
    begin
      exit when v_pendientes + v_contr >= 5;
      v_a := (v_item ->> 'a')::uuid;
      v_b := (v_item ->> 'b')::uuid;
      v_pregunta := left(btrim(coalesce(v_item ->> 'pregunta', '')), 300);
      if v_a = v_b or v_pregunta = '' then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;
      select array_agg(s.id) into v_ok from (
        select m.id
          from memorias m
         where m.usuario_id = p_usuario and m.id in (v_a, v_b)
           and m.estado = 'vigente' and m.tipo = 'estable' and m.texto is not null
           and m.updated_at = case when p_snapshot ->> m.id::text is null then null else (p_snapshot ->> m.id::text)::timestamptz end
           for update
      ) s;
      if v_ok is null or cardinality(v_ok) <> 2 then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;
      insert into contradicciones_memoria (usuario_id, memoria_a, memoria_b, pregunta)
      values (p_usuario, least(v_a, v_b), greatest(v_a, v_b), v_pregunta)
      on conflict (memoria_a, memoria_b) do nothing;
      get diagnostics v_filas = row_count;
      v_contr := v_contr + v_filas;
    exception when invalid_text_representation or check_violation or foreign_key_violation then
      v_omitidos := v_omitidos + 1;
    end;
  end loop;

  update lote_usuarios u
     set estado = 'aplicado', aplicado_at = clock_timestamp(),
         detalle = jsonb_build_object('unidos', v_unidos, 'destacados', cardinality(v_elegidos), 'contradicciones', v_contr, 'omitidos', v_omitidos)
   where u.lote_id = p_lote and u.usuario_id = p_usuario;

  return query select 'aplicado'::text, v_unidos, cardinality(v_elegidos), v_contr, v_omitidos;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolver_contradiccion (SECURITY INVOKER: la RLS owner-only manda)
-- ---------------------------------------------------------------------------
-- La persona dijo cuál vale. p_vale: 'a' | 'b' (la otra queda 'reemplazado' y apunta a la que vale; se conserva como
-- historial, igual que una corrección), 'ambas' (no se contradicen: no se vuelve a preguntar) o 'ninguna' (se olvidan las dos
-- con olvidar_memoria, que también excluye sus mensajes de origen e invalida el resumen; quien llama encola 'regenerar').
-- La contradicción se cierra ANTES de tocar los recuerdos (si no, el trigger la descartaría). Devuelve:
--   'ok' | 'no_encontrada' (no existe, no es tuya o ya estaba cerrada) | 'obsoleta' (alguno ya no está vigente: se descarta).
create or replace function resolver_contradiccion(p_id uuid, p_vale text)
returns table (o_resultado text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c contradicciones_memoria%rowtype;
  v_vigentes int;
  v_pierde uuid;
  v_gana uuid;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if p_vale is null or p_vale not in ('a', 'b', 'ambas', 'ninguna') then
    raise exception 'valor inválido' using errcode = '22023';
  end if;

  select c.* into v_c from contradicciones_memoria c
   where c.id = p_id and c.usuario_id = v_uid and c.estado = 'pendiente' for update;
  if not found then
    return query select 'no_encontrada'::text;
    return;
  end if;

  select count(*) into v_vigentes from (
    select m.id from memorias m
     where m.usuario_id = v_uid and m.id in (v_c.memoria_a, v_c.memoria_b) and m.estado = 'vigente' for update
  ) s;
  if v_vigentes <> 2 then
    update contradicciones_memoria c set estado = 'descartada', pregunta = '', resuelta_at = now() where c.id = v_c.id;
    return query select 'obsoleta'::text;
    return;
  end if;

  update contradicciones_memoria c set estado = 'resuelta', pregunta = '', resuelta_at = now() where c.id = v_c.id;

  if p_vale in ('a', 'b') then
    v_gana := case when p_vale = 'a' then v_c.memoria_a else v_c.memoria_b end;
    v_pierde := case when p_vale = 'a' then v_c.memoria_b else v_c.memoria_a end;
    update memorias m
       set estado = 'reemplazado', reemplazada_por_id = v_gana, destacado = false, updated_at = now()
     where m.id = v_pierde and m.usuario_id = v_uid and m.estado = 'vigente';
  elsif p_vale = 'ninguna' then
    perform olvidar_memoria(v_c.memoria_a, '{}', false);
    perform olvidar_memoria(v_c.memoria_b, '{}', false);
  end if;

  return query select 'ok'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- olvidar_memoria (redefinida de 038: la cadena también sigue a `reemplazada_por_id`)
-- ---------------------------------------------------------------------------
-- Único cambio respecto de 038: al buscar las versiones anteriores de un recuerdo, además de `corrige_id` se siguen los
-- recuerdos que este reemplazó (uniones de consolidación y perdedores de una contradicción). Así "dejar de recordar" y
-- "eliminar" alcanzan los ingredientes de una unión y sus mensajes de origen.
create or replace function olvidar_memoria(p_id uuid, p_mensajes uuid[] default '{}', p_eliminar boolean default false)
returns table (o_recuerdos int, o_mensajes int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cadena uuid[];
  v_origenes uuid[];
  v_fuentes uuid[];
  v_turnos uuid[];
  v_recuerdos int := 0;
  v_mensajes int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if coalesce(cardinality(p_mensajes), 0) > 20 then
    raise exception 'demasiados mensajes' using errcode = '22023';
  end if;

  if not exists (select 1 from memorias m where m.id = p_id and m.usuario_id = v_uid and m.estado <> 'borrado') then
    return query select 0, 0;
    return;
  end if;

  -- 1) El resumen primero.
  perform invalidar_resumen();

  -- 2) El recuerdo, sus versiones anteriores (corrige_id) y lo que reemplazó (reemplazada_por_id).
  with recursive cadena as (
    select m.id, m.corrige_id, m.mensaje_origen_id from memorias m where m.id = p_id and m.usuario_id = v_uid
    union
    select a.id, a.corrige_id, a.mensaje_origen_id
      from memorias a join cadena c on (a.id = c.corrige_id or a.reemplazada_por_id = c.id)
     where a.usuario_id = v_uid
  )
  select array_agg(c.id), array_agg(c.mensaje_origen_id) filter (where c.mensaje_origen_id is not null)
    into v_cadena, v_origenes
    from cadena c;

  -- 3) Fuentes: orígenes + confirmados (solo propios) + el resto de cada turno.
  select array_agg(distinct x.id) into v_fuentes
    from mensajes_chat x
   where x.usuario_id = v_uid
     and (x.id = any(coalesce(v_origenes, '{}') || coalesce(p_mensajes, '{}')));
  select array_agg(distinct y.pedido_id) into v_turnos
    from mensajes_chat y
   where y.usuario_id = v_uid and y.id = any(coalesce(v_fuentes, '{}')) and y.pedido_id is not null;
  select array_agg(distinct z.id) into v_fuentes
    from mensajes_chat z
   where z.usuario_id = v_uid
     and (z.id = any(coalesce(v_fuentes, '{}')) or z.pedido_id = any(coalesce(v_turnos, '{}')));

  -- 4) Recuerdos: sin texto, solo la marca. Al eliminar, también los que salieron de los mensajes que se borran.
  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid
     and m.estado <> 'borrado'
     and (m.id = any(v_cadena) or (p_eliminar and m.mensaje_origen_id = any(coalesce(v_fuentes, '{}'))));
  get diagnostics v_recuerdos = row_count;

  -- 5) Mensajes.
  if p_eliminar then
    delete from mensajes_chat x where x.usuario_id = v_uid and x.id = any(coalesce(v_fuentes, '{}'));
  else
    update mensajes_chat x set excluido_memoria = true
     where x.usuario_id = v_uid and x.id = any(coalesce(v_fuentes, '{}')) and not x.excluido_memoria;
  end if;
  get diagnostics v_mensajes = row_count;

  return query select v_recuerdos, v_mensajes;
end;
$$;

-- ---------------------------------------------------------------------------
-- reclamar_lote_consolidacion / cerrar_lote_consolidacion / intento_fallido_lote_usuario (service_role)
-- ---------------------------------------------------------------------------
-- reclamar: un solo poll gana el lote (enviado, o terminado con el reclamo vencido) y se cuenta el intento. Devuelve
-- (reclamado, intentos). El trabajador cierra el lote como fallido cuando los intentos pasan el tope.
create or replace function reclamar_lote_consolidacion(p_id uuid, p_reclamo_vence_s int default 600)
returns table (o_reclamado boolean, o_intentos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intentos int;
begin
  update lotes_consolidacion l
     set estado = 'terminado', terminado_at = now(), intentos = l.intentos + 1
   where l.id = p_id
     and (l.estado = 'enviado'
          or (l.estado = 'terminado' and l.terminado_at < now() - make_interval(secs => greatest(coalesce(p_reclamo_vence_s, 600), 0))))
  returning l.intentos into v_intentos;
  if found then
    return query select true, v_intentos;
  else
    return query select false, 0;
  end if;
end;
$$;

-- cerrar: ATÓMICO. Con p_error: las personas que seguían 'enviado' pasan a 'error' (vuelven a ser candidatas mañana) y el
-- lote queda 'fallido', en una sola transacción. Sin p_error: el lote se cierra solo si ya nadie quedó 'enviado'
-- ('aplicado' si alguien se aplicó, si no 'fallido'). Un lote nunca queda 'fallido' con personas 'enviado'.
create or replace function cerrar_lote_consolidacion(p_lote uuid, p_error text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aplicadas int;
begin
  if p_error is not null then
    update lote_usuarios u set estado = 'error', error = left(p_error, 80) where u.lote_id = p_lote and u.estado = 'enviado';
    update lotes_consolidacion l set estado = 'fallido', error = left(p_error, 80), terminado_at = coalesce(l.terminado_at, now()) where l.id = p_lote;
    return 'fallido';
  end if;

  if exists (select 1 from lote_usuarios u where u.lote_id = p_lote and u.estado = 'enviado') then
    return 'abierto';
  end if;
  select count(*) into v_aplicadas from lote_usuarios u where u.lote_id = p_lote and u.estado = 'aplicado';
  update lotes_consolidacion l
     set estado = case when v_aplicadas > 0 then 'aplicado' else 'fallido' end,
         error = case when v_aplicadas > 0 then null else 'sin_resultados' end
   where l.id = p_lote;
  return case when v_aplicadas > 0 then 'aplicado' else 'fallido' end;
end;
$$;

-- intento fallido de UNA persona (falla transitoria al leer/aplicar): suma el intento y, pasado el tope, la deja en 'error'.
create or replace function intento_fallido_lote_usuario(p_lote uuid, p_usuario uuid, p_max int default 3, p_codigo text default 'reintentos_agotados')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intentos int;
begin
  update lote_usuarios u set intentos = u.intentos + 1
   where u.lote_id = p_lote and u.usuario_id = p_usuario and u.estado = 'enviado'
  returning u.intentos into v_intentos;
  if not found then
    return false;
  end if;
  if v_intentos >= coalesce(p_max, 3) then
    update lote_usuarios u set estado = 'error', error = left(coalesce(p_codigo, 'reintentos_agotados'), 80)
     where u.lote_id = p_lote and u.usuario_id = p_usuario and u.estado = 'enviado';
    return true;
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- marcar_contradicciones_preguntadas (SECURITY INVOKER)
-- ---------------------------------------------------------------------------
-- El chat la llama solo cuando la respuesta salió completa. Incremento atómico en SQL.
create or replace function marcar_contradicciones_preguntadas(p_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update contradicciones_memoria c
     set preguntada_at = now(), veces_preguntada = c.veces_preguntada + 1
   where c.id = any(p_ids) and c.usuario_id = auth.uid() and c.estado = 'pendiente';
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function reclamar_lote_consolidacion(uuid, int) from public, anon, authenticated;
revoke all on function cerrar_lote_consolidacion(uuid, text) from public, anon, authenticated;
revoke all on function intento_fallido_lote_usuario(uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function reclamar_lote_consolidacion(uuid, int) to service_role;
grant execute on function cerrar_lote_consolidacion(uuid, text) to service_role;
grant execute on function intento_fallido_lote_usuario(uuid, uuid, int, text) to service_role;
revoke execute on function marcar_contradicciones_preguntadas(uuid[]) from public, anon;
grant execute on function marcar_contradicciones_preguntadas(uuid[]) to authenticated;
revoke all on function marcar_pasajeros_vencidos() from public, anon, authenticated;
revoke all on function candidatos_consolidacion(int, int) from public, anon, authenticated;
revoke all on function reservar_lote_consolidacion(jsonb) from public, anon, authenticated;
revoke all on function aplicar_consolidacion(uuid, uuid, jsonb, jsonb, int, int) from public, anon, authenticated;
revoke all on function memorias_cascada_estado() from public, anon, authenticated;
grant execute on function marcar_pasajeros_vencidos() to service_role;
grant execute on function candidatos_consolidacion(int, int) to service_role;
grant execute on function reservar_lote_consolidacion(jsonb) to service_role;
grant execute on function aplicar_consolidacion(uuid, uuid, jsonb, jsonb, int, int) to service_role;

revoke execute on function resolver_contradiccion(uuid, text) from public, anon;
grant execute on function resolver_contradiccion(uuid, text) to authenticated;
-- olvidar_memoria se redefinió: create or replace conserva los permisos de 038, pero se repiten por claridad.
revoke execute on function olvidar_memoria(uuid, uuid[], boolean) from public, anon;
grant execute on function olvidar_memoria(uuid, uuid[], boolean) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Scheduler: Supabase Cron (pg_cron + pg_net). Dos jobs sobre la misma ruta:
--   enviar    una vez por día a las 07:00 UTC (04:00 de Argentina): arma y manda el lote.
--   procesar  cada 15 minutos: archiva pasajeros vencidos y, si un lote terminó, aplica sus resultados.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'memoria-consolidacion-enviar') then
    perform cron.unschedule('memoria-consolidacion-enviar');
  end if;
  if exists (select 1 from cron.job where jobname = 'memoria-consolidacion-procesar') then
    perform cron.unschedule('memoria-consolidacion-procesar');
  end if;
end;
$$;

select cron.schedule(
  'memoria-consolidacion-enviar',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://vitappweb.netlify.app/api/cron/memoria-consolidacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{"accion":"enviar"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'memoria-consolidacion-procesar',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://vitappweb.netlify.app/api/cron/memoria-consolidacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{"accion":"procesar"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
