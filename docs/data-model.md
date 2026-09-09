# Modelo de datos

Single-tenant por usuario — no hay concepto de "tenant" como en NutrIA (profesional/paciente). Cada fila de negocio lleva `usuario_id` referenciando `auth.users` directo.

## `perfiles`

1:1 con `auth.users`. Se crea/actualiza en `src/app/auth/callback/route.ts` en el primer login (nombre/avatar desde el metadata de Google) — no hay trigger de DB, mismo criterio que NutrIA.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | = auth.users.id |
| nombre | text | |
| avatar_url | text | |
| created_at | timestamptz | |

## `medicamentos`

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users |
| nombre | text | |
| dosis | text | opcional |
| hora_programada | text | "HH:MM" |
| momento_dia | text | check: mañana / mediodia / noche |
| condicion | text | opcional, para qué es |
| dias_recurrentes | text[] | días de la semana en español; vacío = todos los días |

## `medicamentos_tomas`

Adherencia — una fila por medicamento+fecha.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| medicamento_id | uuid | references medicamentos, on delete cascade |
| usuario_id | uuid | references auth.users |
| fecha | date | |
| tomado | boolean | |
| tomado_en | timestamptz | null si no se tomó |

unique `(medicamento_id, fecha)`.

## `sesiones_chat`

Historial de chat — replica `ChatProvider.historySessions` del Vitapp original (Flutter), persistido en vez de en memoria.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users |
| created_at | timestamptz | |
| updated_at | timestamptz | se toca en cada mensaje nuevo, para ordenar por actividad |

## `mensajes_chat`

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| sesion_id | uuid | references sesiones_chat, on delete cascade |
| usuario_id | uuid | references auth.users, denormalizado (mismo criterio que `medicamentos_tomas`) |
| role | text | check: user / assistant |
| contenido | text | |
| created_at | timestamptz | |

**Ojo con `sesionId` entrante desde el cliente**: la policy de insert de `mensajes_chat` solo valida `usuario_id = auth.uid()`, no que `sesion_id` sea del mismo usuario — un `sesionId` ajeno/manipulado en la URL podría, en teoría, insertar un mensaje válido pero huérfano (nunca aparece en ningún listado real). Por eso `lib/chat/nucleo.ts#sesionPerteneceAUsuario` se llama siempre antes de usar un `sesionId` entrante en `/api/chat/route.ts` — si no matchea, se trata como si no hubiera llegado ninguno (se crea una sesión nueva).

## RLS

Todas las tablas: `usuario_id = auth.uid()` (o `id = auth.uid()` en `perfiles`) para todas las operaciones. Ver `supabase/migrations/002_rls_policies.sql` y `003_chat_historial.sql`.

## Fuera de alcance (del modelo original de Vitapp, no construido todavía)

- `turnos` (appointments)
- métricas de salud / `health_profiles` (peso, altura, tipo de sangre, condiciones, alergias)
- historial médico / registros con archivo adjunto
- login con Apple
