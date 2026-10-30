-- Vita — memoria persistente, fase 4: consolidación nocturna con la Message Batches API.
-- ESCRITA pero NO aplicada: aplicar a mano con `psql -1` (después de 038-041) y registrar en
-- supabase_migrations.schema_migrations. Idempotente: se puede volver a correr. Sin secretos en este archivo.
--
-- Qué hace (la lógica vive en lib/memoria/consolidacion{,-logica}.ts y en /api/cron/memoria-consolidacion):
--   1) Cada noche (03:00 de Argentina) el servidor manda UN lote (claude-haiku-5-5) con los recuerdos ESTABLES vigentes de las
--      personas con memoria activa cuyos recuerdos cambiaron desde su última consolidación. Viajan solo recuerdos (nunca texto
--      de mensajes del chat), sin los que salieron de un mensaje excluido de la memoria.
--   2) Cada 30 minutos se consulta el lote (no hace nada si no hay uno en vuelo). Cuando terminó, el plan de cada persona se
--      aplica con `aplicar_consolidacion`, en UNA transacción que vuelve a verificar que cada recuerdo citado siga vigente y
--      sin cambios desde la foto (snapshot) que se mandó al modelo, y que la memoria siga activa. Lo que cambió, se olvidó o
--      se borró mientras corría el lote se saltea: un recuerdo borrado no revive.
--   El plan puede (a) unir duplicados EXACTOS en un recuerdo nuevo (origen 'consolidacion'), (b) destacar los más importantes
--   y (c) MARCAR contradicciones: nunca las resuelve, la pregunta la hace vita en el chat o la persona en Privacidad.
--
-- `custom_id` del lote: id opaco por pedido (`c_` + 32 hex al azar) generado ACÁ y mapeado en `lote_usuarios`; nunca el id de la
-- persona. Los resultados llegan en cualquier orden y se vuelven a mapear por ese id.
--
-- Privacidad: ningún texto de recuerdos queda en las tablas de lotes (el snapshot son pares id/updated_at). Olvidar todo,
-- Borrar historial, dejar de recordar y apagar la memoria descartan lo pendiente (`descartar_consolidacion_pendiente`); las
-- contradicciones se cierran solas (y pierden su pregunta) cuando alguno de los dos recuerdos deja de estar vigente.
--
-- Convención del repo: en funciones con `returns table`, las columnas de salida llevan prefijo `o_` y toda referencia a una
-- columna va calificada con alias. SECURITY DEFINER siempre con `search_path` fijo; las del trabajador solo las ejecuta
-- service_role.
-- Sin esta migración la app degrada: no hay consolidación ni contradicciones y el chat (fases 2 y 3) sigue como siempre.

-- ---------------------------------------------------------------------------
-- memorias: origen 'consolidacion' y puntero de reemplazo
-- ---------------------------------------------------------------------------
alter table memorias drop constraint if exists memorias_origen_check;
alter table memorias add constraint memorias_origen_check check (origen in ('chat', 'usuario', 'consolidacion'));

-- El recuerdo que reemplazó a éste: la unión de duplicados, o el que la persona eligió en una contradicción. Es el puntero
-- que usan "dejar de recordar" y el trigger de cascada para alcanzar también las versiones unidas.
alter table memorias add column if not exists reemplazada_por_id uuid references memorias(id) on delete set null;
create index if not exists idx_memorias_reemplazada_por on memorias (reemplazada_por_id) where reemplazada_por_id is not null;

-- ---------------------------------------------------------------------------
-- lotes_consolidacion / lote_usuarios: seguimiento de los lotes (solo service_role)
-- ---------------------------------------------------------------------------
create table if not exists lotes_consolidacion (
  id uuid primary key default gen_random_uuid(),
  batch_id text unique,  -- id del lote en Anthropic; null hasta que se crea
  estado text not null default 'enviado' check (estado in ('enviado', 'terminado', 'aplicado', 'fallido')),
  usuarios int not null default 0 check (usuarios >= 0),
  created_at timestamptz not null default now(),
  terminado_at timestamptz,  -- cuándo se reclamó para aplicar (reserva vencible)
  intentos int not null default 0 check (intentos >= 0),  -- reclamos: tope para que un lote atascado no reintente para siempre
  error text  -- código corto, nunca el mensaje crudo
);
create index if not exists idx_lotes_consolidacion_estado on lotes_consolidacion (estado, created_at);

create table if not exists lote_usuarios (
  lote_id uuid not null references lotes_consolidacion(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  custom_id text not null check (custom_id ~ '^c_[0-9a-f]{32}$'),
  -- Lista ORDENADA [{id, u}] de lo que se mandó (u = updated_at tal cual); la referencia "m3" que ve el modelo es la posición 3.
  snapshot jsonb not null,
  estado text not null default 'enviado' check (estado in ('enviado', 'aplicado', 'error', 'omitido')),
  created_at timestamptz not null default now(),  -- momento de la foto: "consolidado hasta" para elegir candidatos
  aplicado_at timestamptz,
  intentos int not null default 0 check (intentos >= 0),  -- fallas transitorias al aplicar a esta persona
  uso_registrado_at timestamptz,  -- el costo de este pedido ya entró al límite diario (una sola vez)
  detalle jsonb,  -- solo conteos
  error text,
  primary key (lote_id, usuario_id),
  unique (custom_id)
);
-- Una persona no puede estar en dos lotes en vuelo: es la guarda contra dos envíos simultáneos.
create unique index if not exists idx_lote_usuarios_un_enviado on lote_usuarios (usuario_id) where estado = 'enviado';
create index if not exists idx_lote_usuarios_aplicado on lote_usuarios (usuario_id, created_at) where estado = 'aplicado';

-- Registro de sistema: RLS prendida y SIN policies, y sin permisos para anon/authenticated (solo service_role).
alter table lotes_consolidacion enable row level security;
alter table lote_usuarios enable row level security;
revoke all on table lotes_consolidacion from anon, authenticated;
revoke all on table lote_usuarios from anon, authenticated;

-- ---------------------------------------------------------------------------
-- contradicciones_memoria: pares vigentes que parecen contradecirse (la persona decide)
-- ---------------------------------------------------------------------------
create table if not exists contradicciones_memoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  memoria_a uuid not null references memorias(id) on delete cascade,
  memoria_b uuid not null references memorias(id) on delete cascade,
  -- Pregunta corta y neutral para la persona. Se vacía al cerrarse la contradicción (no queda texto derivado).
  pregunta text not null default '' check (char_length(pregunta) <= 300),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelta', 'descartada')),
  preguntada_at timestamptz,  -- última vez que vita la tuvo delante para preguntar
  veces_preguntada int not null default 0 check (veces_preguntada >= 0),
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  -- Par canónico (a < b): el mismo par no se marca dos veces aunque el modelo lo nombre al revés.
  constraint contradicciones_par_ordenado check (memoria_a < memoria_b)
);
-- Un par se marca UNA vez en la vida (también si la persona dijo "valen las dos": no se vuelve a preguntar).
create unique index if not exists idx_contradicciones_par on contradicciones_memoria (memoria_a, memoria_b);
create index if not exists idx_contradicciones_pendientes on contradicciones_memoria (usuario_id, created_at) where estado = 'pendiente';

alter table contradicciones_memoria enable row level security;
-- El dueño solo LEE (owner-only, sin policies de cuidador); todo cambio pasa por las funciones de abajo.
drop policy if exists contradicciones_select_self on contradicciones_memoria;
create policy contradicciones_select_self on contradicciones_memoria for select using (usuario_id = auth.uid());
revoke all on table contradicciones_memoria from anon;
revoke insert, update, delete on table contradicciones_memoria from authenticated;

-- ---------------------------------------------------------------------------
-- Cascada de estado (trigger)
-- ---------------------------------------------------------------------------
-- 1) Un recuerdo que deja de estar vigente cierra las contradicciones pendientes que lo mencionan (y borra su pregunta).
-- 2) Un recuerdo que queda 'borrado' arrastra a los que él reemplazó ('reemplazado' conserva texto) y, si él salió de una
--    unión de consolidación, a la unión: un dato olvidado no puede seguir vivo dentro de un recuerdo unido.
-- Corre por fila y en la misma transacción, también cuando el borrado viene de la app sin RPC (caminos de respaldo).
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

drop trigger if exists trg_memorias_cascada_estado on memorias;
create trigger trg_memorias_cascada_estado
  after update of estado on memorias
  for each row
  when (old.estado is distinct from new.estado)
  execute function memorias_cascada_estado();

-- ---------------------------------------------------------------------------
-- candidatos_consolidacion (service_role)
-- ---------------------------------------------------------------------------
-- Personas con memoria activa, al menos p_minimo recuerdos estables vigentes (sin los que salieron de un mensaje excluido), y
-- algún vigente que cambió DESPUÉS de la foto de su última consolidación aplicada (o nunca consolidada). Sin las que ya están en
-- un lote en vuelo. Las más activas primero.
create or replace function candidatos_consolidacion(p_limite int default 50, p_minimo int default 3)
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
     and not exists (select 1 from mensajes_chat x where x.id = m.mensaje_origen_id and x.excluido_memoria)
     and not exists (select 1 from lote_usuarios e where e.usuario_id = m.usuario_id and e.estado = 'enviado')
   group by m.usuario_id
  having count(*) >= greatest(coalesce(p_minimo, 3), 2)
     and max(m.updated_at) > coalesce(
           (select max(a.created_at) from lote_usuarios a where a.usuario_id = m.usuario_id and a.estado = 'aplicado'),
           '-infinity'::timestamptz)
   order by max(m.updated_at) desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- recuerdos_para_consolidar (service_role)
-- ---------------------------------------------------------------------------
-- Lo que viaja en el pedido de UNA persona: estables vigentes con texto, de una persona con memoria activa, sin los que salieron
-- de un mensaje excluido. Los más usados y recientes primero. El orden define las referencias m1, m2... del snapshot.
create or replace function recuerdos_para_consolidar(p_usuario uuid, p_limite int default 120)
returns table (
  o_id uuid, o_sobre_tipo text, o_sobre_perfil_id uuid, o_sobre_nombre text, o_clave text, o_texto text,
  o_tipo text, o_destacado boolean, o_usos int, o_updated_at timestamptz, o_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.sobre_tipo, m.sobre_perfil_id, m.sobre_nombre, m.clave, m.texto, m.tipo, m.destacado, m.usos, m.updated_at, m.created_at
    from memorias m
    join perfiles p on p.id = m.usuario_id and p.memoria_activa
   where m.usuario_id = p_usuario
     and m.estado = 'vigente' and m.tipo = 'estable' and m.texto is not null and m.texto <> ''
     and not exists (select 1 from mensajes_chat x where x.id = m.mensaje_origen_id and x.excluido_memoria)
   order by m.usos desc, m.updated_at desc, m.id
   limit least(greatest(coalesce(p_limite, 120), 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- reservar_lote_consolidacion (service_role)
-- ---------------------------------------------------------------------------
-- Crea el lote y reserva a cada persona ANTES de llamar a Anthropic. p_usuarios = [{usuario_id, snapshot}]; el custom_id opaco
-- se genera acá. El índice único parcial deja a cada persona en un solo lote en vuelo: si dos envíos corren a la vez, cada
-- persona la gana uno solo. Solo reserva personas con memoria activa. Cero filas = nada para mandar (y no deja lote).
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
    select v_lote, p.id, 'c_' || replace(gen_random_uuid()::text, '-', ''), v_item -> 'snapshot'
      from perfiles p
     where p.id = (v_item ->> 'usuario_id')::uuid and p.memoria_activa
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
--   * Idempotente: se bloquea la fila de lote_usuarios y solo actúa si sigue 'enviado'. Un segundo intento devuelve
--     'ya_aplicado' sin tocar nada (y 'omitido' si la persona olvidó todo o apagó la memoria mientras corría el lote).
--   * Plan viejo = se saltea: cada recuerdo citado debe seguir 'vigente', estable, con texto, sin haber salido de un mensaje
--     excluido y con el mismo `updated_at` que tenía en la foto (p_snapshot = {id: updated_at}); se leen FOR UPDATE, así que
--     un cambio concurrente también se detecta. Si algo no cumple, ESE ítem se omite (los demás siguen).
--   * Cada ítem corre en su propio sub-bloque: si falla (clave repetida, check), se deshace solo ese ítem.
-- Plan (jsonb, ids reales ya validados contra la foto en el servidor):
--   { unir: [{ids: [uuid], texto, clave}], destacados: [uuid], contradicciones: [{a, b, pregunta}] }
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
           and not exists (select 1 from mensajes_chat x where x.id = m.mensaje_origen_id and x.excluido_memoria)
           and m.updated_at = case when p_snapshot ->> m.id::text is null then null else (p_snapshot ->> m.id::text)::timestamptz end
           for update
      ) s;
      if v_ok is null or cardinality(v_ok) <> cardinality(v_ids) then
        v_omitidos := v_omitidos + 1;
        continue;
      end if;

      -- Todos sobre la misma persona (misma expresión que el índice único de 038).
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
       and not exists (select 1 from mensajes_chat x where x.id = m.mensaje_origen_id and x.excluido_memoria)
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
  -- Una contradicción ya preguntada 3 veces sin respuesta (y cuya última ventana de 30 min pasó) se descarta: así no ocupa el
  -- cupo de 5 pendientes. El par queda marcado para siempre (no se vuelve a preguntar).
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
           and not exists (select 1 from mensajes_chat x where x.id = m.mensaje_origen_id and x.excluido_memoria)
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
-- Estado de los lotes (service_role)
-- ---------------------------------------------------------------------------
-- reclamar: un solo poll gana el lote (enviado, o terminado con el reclamo vencido) y se cuenta el intento.
create or replace function reclamar_lote_consolidacion(p_id uuid, p_reclamo_vence_s int default 120)
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
          or (l.estado = 'terminado' and l.terminado_at < now() - make_interval(secs => greatest(coalesce(p_reclamo_vence_s, 120), 0))))
  returning l.intentos into v_intentos;
  if found then
    return query select true, v_intentos;
  else
    return query select false, 0;
  end if;
end;
$$;

-- cerrar: ATÓMICO. Con p_error: las personas que seguían 'enviado' pasan a 'error' (vuelven a ser candidatas mañana) y el lote
-- queda 'fallido', en una sola transacción. Sin p_error: el lote se cierra solo si ya nadie quedó 'enviado'. Si el lote ya
-- tenía un id de Anthropic y se cierra con error, el id se conserva en `error` solo si el llamador lo manda (lote huérfano).
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
    update lotes_consolidacion l set estado = 'fallido', error = left(p_error, 120), terminado_at = coalesce(l.terminado_at, now()) where l.id = p_lote;
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

-- Falla transitoria de UNA persona: suma el intento y, pasado el tope, la deja en 'error'. true = quedó en 'error'.
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

-- Cierra a UNA persona con un error (resultado fallido/vencido/inválido). true = este llamador fue quien la cerró.
create or replace function marcar_error_lote_usuario(p_lote uuid, p_usuario uuid, p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update lote_usuarios u set estado = 'error', error = left(coalesce(p_codigo, 'error'), 80)
   where u.lote_id = p_lote and u.usuario_id = p_usuario and u.estado = 'enviado';
  return found;
end;
$$;

-- El costo de un pedido entra al límite diario UNA sola vez, aunque el lote se procese en varios polls y aunque la persona haya
-- olvidado todo mientras tanto (el lote se cobra igual). true = es la primera vez: el llamador registra el uso.
create or replace function marcar_uso_lote_usuario(p_lote uuid, p_usuario uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update lote_usuarios u set uso_registrado_at = now()
   where u.lote_id = p_lote and u.usuario_id = p_usuario and u.uso_registrado_at is null;
  return found;
end;
$$;

-- Retención: los lotes cerrados se borran a los p_dias (el snapshot es solo ids y fechas, pero no hay motivo para guardarlo).
create or replace function limpiar_lotes_consolidacion(p_dias int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  delete from lotes_consolidacion l
   where l.estado in ('aplicado', 'fallido') and l.created_at < now() - make_interval(days => greatest(coalesce(p_dias, 30), 1));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones de la persona (authenticated, SECURITY DEFINER con auth.uid())
-- ---------------------------------------------------------------------------
-- Descarta lo pendiente de la persona: sus pedidos en vuelo pasan a 'omitido' (cuando el lote termine no se aplica nada) y sus
-- contradicciones pendientes se cierran sin pregunta. Solo toca filas de auth.uid().
create or replace function descartar_consolidacion_pendiente()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  update lote_usuarios u set estado = 'omitido', error = 'descartado', aplicado_at = clock_timestamp()
   where u.usuario_id = v_uid and u.estado = 'enviado';
  update contradicciones_memoria c set estado = 'descartada', pregunta = '', resuelta_at = now()
   where c.usuario_id = v_uid and c.estado = 'pendiente';
end;
$$;

-- El chat la llama solo cuando la respuesta salió completa. Incremento atómico en SQL.
create or replace function marcar_contradicciones_preguntadas(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  update contradicciones_memoria c
     set preguntada_at = now(), veces_preguntada = c.veces_preguntada + 1
   where c.id = any(coalesce(p_ids, '{}')) and c.usuario_id = v_uid and c.estado = 'pendiente';
end;
$$;

-- La persona dijo cuál vale. p_vale: 'a' | 'b' (la otra queda 'reemplazado' y apunta a la que vale; se conserva como historial,
-- igual que una corrección), 'ambas' (no se contradicen: no se vuelve a preguntar) o 'ninguna' (se olvidan las dos con
-- olvidar_memoria, que también excluye sus mensajes de origen e invalida el resumen). La contradicción se cierra ANTES de tocar
-- los recuerdos (si no, el trigger la descartaría). Devuelve 'ok' | 'no_encontrada' (no existe, no es tuya o ya está cerrada) |
-- 'obsoleta' (alguno ya no está vigente: se descarta).
create or replace function resolver_contradiccion(p_id uuid, p_vale text)
returns table (o_resultado text)
language plpgsql
security definer
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
    perform olvidar_memoria(v_c.memoria_a);
    perform olvidar_memoria(v_c.memoria_b);
  end if;

  return query select 'ok'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacidad: las funciones de la 041, ahora también siguen `reemplazada_por_id` y descartan lo pendiente
-- ---------------------------------------------------------------------------
-- Siguen siendo SECURITY INVOKER (la RLS owner-only manda). Cambios respecto de la 041: la cadena de olvidar_memoria incluye
-- lo que el recuerdo reemplazó (uniones de consolidación, perdedores de una contradicción), y las tres llaman a
-- descartar_consolidacion_pendiente.
create or replace function olvidar_memoria(p_id uuid)
returns table (o_recuerdos int, o_mensajes int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cadena uuid[];
  v_origenes uuid[];
  v_recuerdos int := 0;
  v_mensajes int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if not exists (select 1 from memorias m where m.id = p_id and m.usuario_id = v_uid and m.estado <> 'borrado') then
    return query select 0, 0;
    return;
  end if;

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

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid and m.estado <> 'borrado' and m.id = any(v_cadena);
  get diagnostics v_recuerdos = row_count;

  update mensajes_chat y
     set excluido_memoria = true
   where y.usuario_id = v_uid
     and not y.excluido_memoria
     and (
       y.id = any(coalesce(v_origenes, '{}'))
       or (
         y.role = 'assistant'
         and exists (
           select 1
             from mensajes_chat o
            where o.usuario_id = v_uid
              and o.id = any(coalesce(v_origenes, '{}'))
              and o.sesion_id = y.sesion_id
              and y.created_at > o.created_at
              and not exists (
                select 1
                  from mensajes_chat n
                 where n.usuario_id = v_uid
                   and n.sesion_id = o.sesion_id
                   and n.role = 'user'
                   and n.created_at > o.created_at
                   and n.created_at < y.created_at
              )
         )
       )
     );
  get diagnostics v_mensajes = row_count;

  if v_recuerdos > 0 or v_mensajes > 0 then
    perform invalidar_resumen();
    perform descartar_consolidacion_pendiente();
  end if;

  return query select v_recuerdos, v_mensajes;
end;
$$;

create or replace function olvidar_todo_memoria()
returns table (o_recuerdos int, o_mensajes int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recuerdos int := 0;
  v_mensajes int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid and m.estado <> 'borrado';
  get diagnostics v_recuerdos = row_count;

  update mensajes_chat x
     set excluido_memoria = true
   where x.usuario_id = v_uid and not x.excluido_memoria;
  get diagnostics v_mensajes = row_count;

  perform invalidar_resumen();
  perform descartar_consolidacion_pendiente();

  return query select v_recuerdos, v_mensajes;
end;
$$;

create or replace function borrar_recuerdos_de_sesiones_hasta(p_corte timestamptz)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int := 0;
begin
  if v_uid is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  update memorias m
     set estado = 'borrado', texto = null, destacado = false, updated_at = now()
   where m.usuario_id = v_uid
     and m.estado <> 'borrado'
     and m.mensaje_origen_id in (
       select x.id
         from mensajes_chat x
         join sesiones_chat s on s.id = x.sesion_id
        where x.usuario_id = v_uid and s.usuario_id = v_uid and s.updated_at < p_corte
     );
  get diagnostics v_n = row_count;

  if exists (select 1 from sesiones_chat s where s.usuario_id = v_uid and s.updated_at < p_corte) then
    perform invalidar_resumen();
    perform descartar_consolidacion_pendiente();
  end if;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function memorias_cascada_estado() from public, anon, authenticated;

revoke all on function candidatos_consolidacion(int, int) from public, anon, authenticated;
revoke all on function recuerdos_para_consolidar(uuid, int) from public, anon, authenticated;
revoke all on function reservar_lote_consolidacion(jsonb) from public, anon, authenticated;
revoke all on function aplicar_consolidacion(uuid, uuid, jsonb, jsonb, int, int) from public, anon, authenticated;
revoke all on function reclamar_lote_consolidacion(uuid, int) from public, anon, authenticated;
revoke all on function cerrar_lote_consolidacion(uuid, text) from public, anon, authenticated;
revoke all on function intento_fallido_lote_usuario(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function marcar_error_lote_usuario(uuid, uuid, text) from public, anon, authenticated;
revoke all on function marcar_uso_lote_usuario(uuid, uuid) from public, anon, authenticated;
revoke all on function limpiar_lotes_consolidacion(int) from public, anon, authenticated;
grant execute on function candidatos_consolidacion(int, int) to service_role;
grant execute on function recuerdos_para_consolidar(uuid, int) to service_role;
grant execute on function reservar_lote_consolidacion(jsonb) to service_role;
grant execute on function aplicar_consolidacion(uuid, uuid, jsonb, jsonb, int, int) to service_role;
grant execute on function reclamar_lote_consolidacion(uuid, int) to service_role;
grant execute on function cerrar_lote_consolidacion(uuid, text) to service_role;
grant execute on function intento_fallido_lote_usuario(uuid, uuid, int, text) to service_role;
grant execute on function marcar_error_lote_usuario(uuid, uuid, text) to service_role;
grant execute on function marcar_uso_lote_usuario(uuid, uuid) to service_role;
grant execute on function limpiar_lotes_consolidacion(int) to service_role;

revoke execute on function descartar_consolidacion_pendiente() from public, anon;
revoke execute on function marcar_contradicciones_preguntadas(uuid[]) from public, anon;
revoke execute on function resolver_contradiccion(uuid, text) from public, anon;
revoke execute on function olvidar_memoria(uuid) from public, anon;
revoke execute on function olvidar_todo_memoria() from public, anon;
revoke execute on function borrar_recuerdos_de_sesiones_hasta(timestamptz) from public, anon;
grant execute on function descartar_consolidacion_pendiente() to authenticated;
grant execute on function marcar_contradicciones_preguntadas(uuid[]) to authenticated;
grant execute on function resolver_contradiccion(uuid, text) to authenticated;
grant execute on function olvidar_memoria(uuid) to authenticated;
grant execute on function olvidar_todo_memoria() to authenticated;
grant execute on function borrar_recuerdos_de_sesiones_hasta(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduler: Supabase Cron (pg_cron + pg_net). Dos jobs sobre /api/cron/memoria-consolidacion:
--   memoria-consolidacion-enviar     03:00 de Argentina (06:00 UTC): arma y manda el lote.
--   memoria-consolidacion-procesar   cada 30 minutos: consulta el lote en vuelo y aplica lo terminado (no hace nada si no hay).
-- SIN secretos en este archivo: los comandos se derivan del job `dosis-vencidas` (migración 018), que ya trae la URL y el header
-- `x-cron-secret` reales; solo se cambia el path (con ?accion=...). Se conserva su `timeout_milliseconds` (migración 042) o, si no
-- lo tiene, se le agrega 10 s (el mismo tope que `maxDuration` de la ruta). Si ese job no existe o pg_cron no está, no hace nada.
-- Rollback: select cron.unschedule('memoria-consolidacion-enviar'); select cron.unschedule('memoria-consolidacion-procesar');
-- ---------------------------------------------------------------------------
do $$
declare
  v_base text;
  v_def record;
  v_comando text;
  v_con_timeout text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'memoria-consolidacion: pg_cron no está instalado; no se agendan los jobs.';
    return;
  end if;

  execute 'select command from cron.job where jobname = $1' into v_base using 'dosis-vencidas';
  if v_base is null then
    raise notice 'memoria-consolidacion: no existe el job dosis-vencidas (migración 018); no se agendan los jobs.';
    return;
  end if;

  for v_def in
    select * from (values
      ('memoria-consolidacion-enviar', '0 6 * * *', 'enviar'),
      ('memoria-consolidacion-procesar', '*/30 * * * *', 'procesar')
    ) as t(nombre, horario, accion)
  loop
    v_comando := replace(v_base, '/api/cron/dosis-vencidas', '/api/cron/memoria-consolidacion?accion=' || v_def.accion);
    if v_comando = v_base then
      raise notice 'memoria-consolidacion: el comando de dosis-vencidas no contiene la ruta esperada; no se agenda %.', v_def.nombre;
      continue;
    end if;

    if position('timeout_milliseconds' in v_comando) = 0 then
      v_con_timeout := replace(v_comando, 'body := ''{}''::jsonb', 'body := ''{}''::jsonb,' || chr(10) || '    timeout_milliseconds := 10000');
      if v_con_timeout = v_comando then
        raise notice 'memoria-consolidacion: % queda con el timeout por defecto de pg_net (la forma del comando no es la esperada).', v_def.nombre;
      end if;
      v_comando := v_con_timeout;
    end if;

    if exists (select 1 from cron.job where jobname = v_def.nombre) then
      perform cron.unschedule(v_def.nombre);
    end if;
    perform cron.schedule(v_def.nombre, v_def.horario, v_comando);
  end loop;
end;
$$;
