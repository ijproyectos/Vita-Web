-- Vita — memoria persistente del chat, fase 2: recuerdos (tabla `memorias`) y búsqueda en mensajes.
-- ESCRITA pero NO aplicada: aplicar a mano con `psql -1` y registrar en supabase_migrations.schema_migrations.
-- Orden: 038 -> 039 (herramientas) -> 040 (privacidad). Idempotente: se puede volver a correr.
--
-- Decisión de privacidad: la memoria es SOLO del dueño (quien la contó). Ninguna policy de cuidador:
-- ni la persona cuidada ni otros cuidadores ven estas filas. Las sesiones de chat se mantienen tal cual.
-- Sin esta migración la app degrada: la memoria queda apagada y el chat funciona igual.
-- No se corre en una transacción propia: se aplica con `psql -1`.

-- ---------------------------------------------------------------------------
-- mensajes_chat: marca "dejar de recordar" y búsqueda de texto
-- ---------------------------------------------------------------------------
-- Marca "olvidar": el mensaje sigue visible en el historial pero buscar_memoria nunca lo encuentra.
alter table mensajes_chat add column if not exists excluido_memoria boolean not null default false;
-- Búsqueda de texto en español sobre lo que dijo cada uno.
alter table mensajes_chat add column if not exists busqueda tsvector
  generated always as (to_tsvector('spanish', coalesce(contenido, ''))) stored;
create index if not exists idx_mensajes_chat_busqueda on mensajes_chat using gin (busqueda);

-- ---------------------------------------------------------------------------
-- perfiles: interruptor y aviso de primera vez
-- ---------------------------------------------------------------------------
alter table perfiles add column if not exists memoria_activa boolean not null default true;
alter table perfiles add column if not exists memoria_aviso_visto_at timestamptz;

-- ---------------------------------------------------------------------------
-- memorias: un recuerdo por fila
-- ---------------------------------------------------------------------------
create table if not exists memorias (
  id uuid primary key default gen_random_uuid(),
  -- Dueño: quien lo contó. Se borra con la cuenta.
  usuario_id uuid not null references auth.users(id) on delete cascade,
  -- Sobre quién es: la propia persona, un familiar con perfil, u otra persona nombrada a mano.
  sobre_tipo text not null check (sobre_tipo in ('yo', 'familiar', 'otro')),
  sobre_perfil_id uuid, -- perfil del familiar cuando se sabe (sin FK: el recuerdo sobrevive a que se desvincule)
  sobre_nombre text,    -- nombre libre ("Laura") cuando no hay perfil
  clave text not null,  -- tema estable ("dia_de_visita"): misma clave = corregir, no duplicar
  texto text,           -- corto; null/vacío solo si está borrado
  tipo text not null default 'estable' check (tipo in ('estable', 'pasajero')),
  vence_at timestamptz, -- pasajeros: +3 días
  estado text not null default 'vigente' check (estado in ('vigente', 'reemplazado', 'borrado')),
  corrige_id uuid references memorias(id) on delete set null,
  destacado boolean not null default false,
  usos int not null default 0 check (usos >= 0),
  origen text not null default 'chat' check (origen in ('chat', 'usuario')),
  mensaje_origen_id uuid, -- mensaje del usuario que lo originó; sin FK: si se borra el mensaje, la marca de borrado queda
  busqueda tsvector generated always as (to_tsvector('spanish', coalesce(texto, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un recuerdo borrado no conserva el texto: queda solo la marca, para que nada lo reviva.
  constraint memorias_borrado_sin_texto check (estado <> 'borrado' or texto is null or texto = ''),
  constraint memorias_texto_si_no_borrado check (estado = 'borrado' or (texto is not null and texto <> '')),
  -- Un pasajero siempre vence y nunca es destacado.
  constraint memorias_pasajero_vence check (tipo <> 'pasajero' or (vence_at is not null and not destacado)),
  constraint memorias_sobre_coherente check (
    (sobre_tipo = 'yo' and sobre_perfil_id is null and sobre_nombre is null)
    or (sobre_tipo = 'familiar' and (sobre_perfil_id is not null or sobre_nombre is not null))
    or (sobre_tipo = 'otro' and sobre_nombre is not null)
  )
);

-- Un solo vigente por (dueño, sobre quién, clave). `sobre` se normaliza: 'yo', 'perfil:<id>' o 'nombre:<minúsculas>'.
create unique index if not exists idx_memorias_un_vigente on memorias (
  usuario_id,
  (case
     when sobre_tipo = 'yo' then 'yo'
     when sobre_perfil_id is not null then 'perfil:' || sobre_perfil_id::text
     else 'nombre:' || lower(coalesce(sobre_nombre, ''))
   end),
  clave
) where estado = 'vigente';

create index if not exists idx_memorias_destacadas on memorias (usuario_id, usos desc) where estado = 'vigente' and destacado;
create index if not exists idx_memorias_vencen on memorias (vence_at) where estado = 'vigente' and vence_at is not null;
create index if not exists idx_memorias_origen on memorias (mensaje_origen_id) where mensaje_origen_id is not null;
create index if not exists idx_memorias_busqueda on memorias using gin (busqueda);

alter table memorias enable row level security;

-- Solo el dueño. Sin policies de cuidador, a propósito.
drop policy if exists memorias_select_self on memorias;
drop policy if exists memorias_insert_self on memorias;
drop policy if exists memorias_update_self on memorias;
drop policy if exists memorias_delete_self on memorias;
create policy memorias_select_self on memorias for select using (usuario_id = auth.uid());
create policy memorias_insert_self on memorias for insert with check (usuario_id = auth.uid());
create policy memorias_update_self on memorias for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy memorias_delete_self on memorias for delete using (usuario_id = auth.uid());

-- La memoria es una decisión de la propia persona: un cuidador con rol `editar`
-- puede actualizar su perfil, pero no prender ni apagar su memoria.
create or replace function public.perfiles_proteger_columnas_ajenas()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.id then
    if new.id is distinct from old.id
      or new.uso_app is distinct from old.uso_app
      or new.onboarding_completado_at is distinct from old.onboarding_completado_at
      or new.avatar_url is distinct from old.avatar_url
      or new.created_at is distinct from old.created_at
      or new.memoria_activa is distinct from old.memoria_activa
      or new.memoria_aviso_visto_at is distinct from old.memoria_aviso_visto_at
    then
      raise exception 'columna_no_editable_por_cuidador';
    end if;
  end if;
  return new;
end;
$$;
