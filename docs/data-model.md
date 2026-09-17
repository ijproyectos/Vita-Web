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
