-- Nota: escrita pero NO aplicada. Aplicar a mano con psql (no `db push`) y registrar en schema_migrations.
-- Registro por respuesta del chat con vita: latencia, vueltas del modelo, tools, tokens, errores y
-- versión del prompt, para medir costo, velocidad y fallas antes de construir memoria.
--
-- PRIVACIDAD: NO guarda texto de mensajes, ni inputs/outputs de tools, ni mensajes de error crudos.
-- `tools` son solo NOMBRES de tools. `error_codigo` es un código corto (p. ej. anthropic_529, timeout).
--
-- Mismo patrón que uso_ia_diario (013): RLS habilitada SIN ninguna policy, a propósito. Es registro de
-- sistema, no dato del usuario; se escribe siempre con el cliente service_role (lib/supabase/admin.ts)
-- después de que la sesión ya autenticó al usuario. Nadie lo lee ni lo modifica desde la API REST.
--
-- RETENCIÓN: el cron existente `dosis-vencidas` (app/api/cron/dosis-vencidas, cliente admin
-- sancionado) borra las filas de más de 90 días en cada tick; si la tabla no existe, se degrada.
-- No hay job nuevo.
--
-- `sesion_id` y `pedido_id` son uuid sueltos, sin FK: el registro sobrevive a que se borre la sesión.
-- Al borrar la cuenta (`usuario_id`) las filas se borran en cascada.

create table registros_chat (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  pedido_id uuid,
  sesion_id uuid,
  created_at timestamptz not null default now(),
  version_prompt text not null,
  modelo text not null,
  latencia_ms int not null,
  latencia_primer_token_ms int, -- null si la respuesta no streameó texto
  vueltas_modelo int not null default 0,
  tools text[] not null default '{}', -- solo nombres
  escrituras int not null default 0,  -- llamadas a tools de escritura
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  tokens_cache_lectura int not null default 0,
  tokens_cache_escritura int not null default 0,
  resultado text not null
    check (resultado in ('ok', 'error', 'limite', 'confirmacion', 'cancelacion', 'replay')),
  error_codigo text
);

alter table registros_chat enable row level security;
-- Deliberadamente sin policies: solo service_role (bypassa RLS).

create index idx_registros_chat_created_at on registros_chat (created_at);
create index idx_registros_chat_usuario on registros_chat (usuario_id, created_at);
