# Modelo de datos

Single-tenant por usuario — cada fila de negocio lleva `usuario_id` referenciando `auth.users` directo. Todas las tablas: RLS `usuario_id = auth.uid()` (o `id = auth.uid()` en `perfiles`) para todas las operaciones.

## `perfiles`

1:1 con `auth.users`. Fila creada en `src/app/auth/callback/route.ts` en el primer login (`upsert` con `ignoreDuplicates: true` — solo completa nombre/avatar la primera vez, nunca pisa una edición posterior del usuario en re-logins).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | = auth.users.id |
| nombre | text | |
| avatar_url | text | |
| created_at | timestamptz | |
| fecha_nacimiento | date | opcional, editable en Resumen de salud |
| edad_rango | text | grueso, sembrado por la encuesta de onboarding; redundante en cuanto se carga `fecha_nacimiento` |
| genero | text | |
| grupo_sanguineo | text | |
| altura_cm | numeric | |
| peso_kg | numeric | |
| condiciones | jsonb | array de `{label, tipo: 'permanente'\|'temporal', desde}` |
| alergias | text[] | |
| obra_social | text | |
| numero_afiliado | text | |
| contacto_emergencia_nombre | text | |
| contacto_emergencia_telefono | text | |
| onboarding_completado_at | timestamptz | gatea si `/app/*` redirige a `/onboarding/nombre` |

## `medicamentos`

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users |
| nombre | text | |
| dosis | text | opcional |
| unidad | text | default 'mg' |
| hora_programada | text | "HH:MM" |
| momento_dia | text | check: mañana / mediodia / tarde / noche |
| condicion | text | opcional, legacy — no se pide en el form actual |
| dias_recurrentes | text[] | días de la semana; vacío = todos los días. No se pide en el form actual (default `[]`), sigue disponible vía chat |
| frecuencia | text | descriptiva ("1 vez al día"...) — no gobierna el scheduling real |
| con_comida | text | check: antes / con / despues / no-importa |
| duracion | text | label libre ("7 días" / "Indefinido"...) |
| notas | text | |

El form "Agregar medicamento" permite elegir varios momentos del día a la vez — al guardar se inserta **una fila por momento** (mismo dato compartido, hora default por momento vía `HORA_POR_MOMENTO` en `lib/medicamentos/tipos.ts`).

Columna agregada por la migración 014 (aplicada 2026-10-11): `inventario_id uuid null references inventario_pastillas(id) on delete set null` — el stock compartido por todas las filas del mismo medicamento (ver `inventario_pastillas`).

## `inventario_pastillas`

Stock de pastillas por medicamento (migración 014, aplicada 2026-10-11). Una fila por medicamento real (usuario + nombre + dosis), compartida por todas sus filas de `medicamentos` vía `medicamentos.inventario_id`.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users, on delete cascade |
| nombre | text | |
| dosis | text | opcional |
| stock | int | check >= 0 |
| pastillas_por_toma | int | default 1, check > 0 |
| umbral_alerta | int | default 5, check >= 0 — "poco stock" = `stock < umbral_alerta` |
| updated_at / created_at | timestamptz | |

Índice único `idx_inventario_unico` sobre `(usuario_id, lower(btrim(nombre)), lower(btrim(coalesce(dosis, ''))))`.

**RLS**: `inventario_pastillas_all_self` (dueño, CRUD) + `inventario_pastillas_select_cuidador` (cuidador con vínculo `aceptado`, solo `select`).

**RPC** `ajustar_stock_pastillas(p_inventario_id uuid, p_direccion int) returns int` — `security definer`, mueve UNA toma: `stock = greatest(0, stock + p_direccion * pastillas_por_toma)` atómico; `p_direccion` solo acepta -1/+1 (el cliente nunca manda una cantidad libre); solo actúa si `auth.uid()` es el dueño o un cuidador `aceptado` del dueño (si no, devuelve null sin tocar nada). Es la única vía de escritura de stock del cuidador. `execute` revocado a `public`/`anon`.

## `medicamentos_tomas`

Adherencia — una fila por medicamento+fecha. Sin cambios respecto al pase anterior (booleano `tomado` alcanza; este diseño no tiene concepto de "sin confirmar"/alerta a un contacto).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| medicamento_id | uuid | references medicamentos, on delete cascade |
| usuario_id | uuid | references auth.users |
| fecha | date | |
| tomado | boolean | |
| tomado_en | timestamptz | null si no se tomó |

unique `(medicamento_id, fecha)`.

## `turnos`

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users |
| especialidad | text | |
| profesional | text | opcional |
| lugar | text | opcional |
| fecha | date | |
| hora | text | "HH:MM" |
| motivo | text | opcional |
| recordatorio | text | descriptivo ("1 día antes"...), sin notificación real detrás |
| acompanado | boolean | solo el flag, no notifica a nadie |
| notas | text | |
| created_at | timestamptz | |

Momento del día (para agrupar en la Rutina) se deriva de `hora` con `momentoDelDia()` (`lib/rutina/momento.ts`), no se guarda aparte. "Próximo"/pasado se deriva de `fecha`, sin columna de estado.

## `sesiones_chat` / `mensajes_chat`

Historial de chat con vita — sin cambios respecto al pase anterior. Ver `003_chat_historial.sql`.

## `enlaces_profesional`

Links temporales de solo lectura para mostrarle un resumen de salud a un profesional (`/p/{token}`, sin login). **Migración 015 aplicada 2026-10-11** (psql + registro en `schema_migrations`; `supabase/tests/enlaces-profesional.sql` 17/17 PASS).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK `auth.users` on delete cascade | dueño |
| `token_hash` | text unique not null | sha256 hex del token; el token crudo (32 bytes base64url) se muestra una vez y nunca se guarda |
| `etiqueta` | text null | ej. "Dra. Pérez", solo la ve el dueño |
| `expira_at` | timestamptz not null | 24 h / 7 d / 30 d |
| `revocado_at` | timestamptz null | |
| `created_at` | timestamptz | |
| `ultimo_acceso_at` | timestamptz null | |
| `accesos` | int default 0 | |

**RLS**: `enlaces_profesional_all_self` (dueño, CRUD). Sin ninguna otra policy; `anon` sin privilegios de tabla.

**RPC `resumen_profesional(p_token text) returns jsonb`** (`security definer`, grant a `anon` y `authenticated`): hashea el token en SQL (`sha256()` nativo), y si el link existe, no está revocado ni vencido, suma `accesos`/`ultimo_acceso_at` y devuelve el resumen (paciente con nombre de pila, condiciones, alergias, medicamentos con stock restante, adherencia de 14 días, próximos 5 turnos, 5 estudios recientes sin paths, contacto de emergencia). Si no, devuelve `null` sin distinguir el motivo. Nunca incluye email, chat, cuidadores, ids ni paths de archivos. Tests: `supabase/tests/enlaces-profesional.sql`.

## `estudios`

Estudios médicos cargados por foto (cámara o galería), con extracción automática por IA. Ver `007_estudios.sql`.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users |
| tipo | text | ej. "Análisis de sangre completo" — null si la extracción falló |
| fecha | date | solo si la IA la vio en la imagen, y solo si es una fecha válida (`fechaValidaOnull` en `lib/estudios/nucleo.ts`) |
| resumen | text | 1-2 oraciones generadas por la IA |
| valores | jsonb | array de `{nombre, valor}` |
| archivo_path | text | path dentro del bucket `estudios` |
| archivo_tipo | text | mime type real del archivo subido |
| estado | text | check: listo / error — 'error' si la extracción falló, la foto se guarda igual |
| created_at | timestamptz | |

**Storage**: bucket privado `estudios`, path `{usuario_id}/{uuid}.{ext}`. 3 policies de `storage.objects` (select/insert/delete) que exigen `(storage.foldername(name))[1] = auth.uid()::text` — mismo patrón que los buckets privados de NutrIA. La app nunca arma una URL a mano — siempre genera una signed URL de corta duración (`lib/estudios/nucleo.ts#listar`, 1 hora) para mostrar la foto.

## `vinculos_cuidador`

Vínculo de solo lectura entre un elder (dueño de los datos) y un cuidador. Ver `008_cuidadores.sql`. La app aún no consume esta tabla (Fase 1 de `modo-cuidador` — solo schema/RLS/RPCs; UI e integración llegan en PRs posteriores).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| elder_id | uuid | references auth.users — dueño de los datos |
| cuidador_id | uuid | references auth.users, nullable — null hasta que el cuidador reclama la invitación |
| email_invitado | text | email al que se invitó; el claim compara contra `auth.users.email` del que reclama (case-insensitive) |
| token | text | único, generado con `gen_random_bytes(24)`, single-use |
| estado | text | check: pendiente / aceptado / revocado |
| expira_at | timestamptz | default `now() + 7 days` |
| aceptado_at | timestamptz | null hasta el claim |
| created_at | timestamptz | |

unique parcial `(elder_id, cuidador_id) where cuidador_id is not null` — evita vínculos duplicados una vez reclamados; antes del claim (`cuidador_id is null`) no aplica, así que reinvitar reemplaza el token de la fila pendiente existente en vez de crear una nueva.

**RLS**: `vinculos_all_elder` (el elder tiene CRUD sobre sus propios vínculos, pero el `with check` bloquea que un update directo deje la fila en `estado='aceptado'` — esa transición solo puede ocurrir dentro de la RPC `security definer`, que ignora esta policy por completo) + `vinculos_select_cuidador` (el cuidador ya vinculado puede ver sus propios vínculos). No existe policy de insert/update/delete para el cuidador — la única vía de escritura de su lado es la RPC `reclamar_invitacion_cuidador`.

**RLS aditiva sobre datos del elder** (coexiste con `medicamentos_all_self` / `medicamentos_tomas_all_self`, no las reemplaza — Postgres evalúa todas las policies del mismo comando con OR): `medicamentos_select_cuidador` y `medicamentos_tomas_select_cuidador` — el cuidador con vínculo `estado = 'aceptado'` puede leer (`select` únicamente) los `medicamentos`/`medicamentos_tomas` del elder vinculado. `perfiles` no recibe ninguna policy nueva (RLS es de fila, no de columna — una policy de select ahí expondría `condiciones`/`alergias`/`peso_kg`/`obra_social`); el nombre del elder se expone solo vía la RPC de abajo.

**RPCs** (`security definer`, `search_path` fijado, `execute` revocado de `public`/`anon` y otorgado solo a `authenticated`):
- `reclamar_invitacion_cuidador(p_token text) returns table (elder_id uuid, nombre text)` — nunca recibe `cuidador_id` como parámetro, siempre usa `auth.uid()` internamente. Valida token existente + `estado = 'pendiente'`, no expirado, y `email_invitado` coincide (case-insensitive) con el email de la cuenta autenticada; si pasa, marca `cuidador_id = auth.uid()`, `estado = 'aceptado'`, `aceptado_at = now()`.
- `listar_elders_vinculados() returns table (elder_id uuid, nombre text)` — elders con vínculo aceptado hacia el cuidador autenticado; única fuente de "nombre del elder" para el cuidador.

## `alertas_dosis`

Log + dedupe de alertas de dosis vencida (una fila por `(medicamento_id, fecha)` evita reenvíos del cron). Ver `008_cuidadores.sql`. Sin policies propias — RLS habilitada sin ninguna policy, solo accesible vía `service_role` (cron route, Fase 3 de `modo-cuidador`, aún no implementada).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| medicamento_id | uuid | references medicamentos, on delete cascade |
| fecha | date | |
| enviado_at | timestamptz | |
| destinatarios | int | cantidad de cuidadores notificados |
| estado | text | check: enviado / error |
| error | text | detalle si `estado = 'error'` |

unique `(medicamento_id, fecha)`.

## Fuera de alcance (sin tabla, decisión — ver CLAUDE.md)

- Métricas de salud (presión, glucemia, peso) — "Monitoreo activo" en Mi Salud.
- Vacunas / consultas — timeline de "Historial" en Mi Salud (a diferencia de Estudios, que sí tiene tabla).
- Login con Apple.

Rol Cuidador / vínculo con otro usuario ya no está fuera de alcance — ver `vinculos_cuidador`/`alertas_dosis` arriba (`008_cuidadores.sql`, Fase 1 de la feature `modo-cuidador`; UI e integración en PRs posteriores del mismo change).
