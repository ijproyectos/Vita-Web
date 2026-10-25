# Modelo de datos

Cada fila de negocio lleva `usuario_id` referenciando `auth.users` directo, con RLS `usuario_id = auth.uid()` (o `id = auth.uid()` en `perfiles`) para el dueño. Además, desde `021` un cuidador con vínculo aceptado lee (cualquier rol) y escribe (rol `editar`) los datos de la persona que cuida — ver la sección Familia.

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
| apellido | text | `025_perfil_campos.sql` (aplicada 2026-10-22) — "Apellido" de Editar perfil, máx. 80 |
| telefono | text | `025` — "Teléfono" de Editar perfil, máx. 40 |
| contacto_emergencia_relacion | text | `025` — "Es tu…" (Hermana, Pareja, Mamá…), máx. 40 |
| color | text | `021_familia.sql` — clave de paleta (`teal`/`violeta`/`ambar`/`rosa`/`azul`, check), la UI la mapea a tokens `--persona-<clave>` (`lib/familia/colores.ts`). null = color por defecto |

**Familia (021)**: además de las policies `_self`, `perfiles_select_cuidador` (`es_cuidador_de(id)`, cualquier rol) y `perfiles_update_cuidador` (`puede_editar_de(id)`). Sin policy de INSERT para el cuidador (un perfil ajeno nace solo desde el admin client — perfil gestionado — o en el login de su dueño), por eso `lib/perfil/nucleo.ts` hace update-primero y upsert solo como fallback. El trigger `perfiles_proteger_columnas_ajenas` rechaza (`columna_no_editable_por_cuidador`) que alguien que no es el dueño cambie `id`/`uso_app`/`onboarding_completado_at`/`avatar_url`/`created_at`; service_role no se restringe.

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

Columnas agregadas por la migración 023 (`023_rutina_detalles.sql`, aplicada 2026-10-22): `indicado_por text null` ("Indicado por…" en la hoja de detalle de la Rutina) y `fecha_inicio date null` ("Desde"; si es null se usa `created_at`). La UI oculta ambos datos mientras no existan.

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

Columnas agregadas por la migración 023 (aplicada 2026-10-22): `direccion text null` (+ "Cómo llegar"), `telefono text null` (+ "Llamar al consultorio") y `llevar jsonb not null default '[]'` — checklist "Qué llevar" como `[{"t": "DNI", "ok": false}]` (máx. 30 ítems, `ok` = ya lo preparó). `lib/turnos/nucleo.ts` degrada (reintenta sin estas columnas) si la migración falta.

## `mediciones`

"Monitoreo activo" de Mi Salud (`022_mediciones.sql`, aplicada 2026-10-22). Una fila = una medición puntual.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users, on delete cascade |
| tipo | text | `presion`, `glucemia`, `peso`, `pulso`, `saturacion`, `temperatura` (check) |
| valor | numeric | presión: sistólica (mmHg); glucemia mg/dL; peso kg; pulso lpm; saturación %; temperatura °C |
| valor_secundario | numeric | solo `presion`: diastólica (obligatoria y menor que `valor`); null en el resto |
| pulso | numeric | solo `presion`, opcional (lpm) |
| contexto | text | solo `glucemia`, opcional: `ayunas`, `despues_comer`, `otro` |
| medido_at | timestamptz | default `now()`; el momento del día se deriva de la hora AR, sin columna |
| notas | text | opcional, máx. 500 caracteres |
| created_at | timestamptz | |

Los CHECK por tipo (`mediciones_valor_rango`, etc.) son de **plausibilidad** (descartan errores de tipeo), no rangos clínicos. Índice `(usuario_id, tipo, medido_at desc)`. Los rangos de referencia que muestra la UI (`lib/mediciones/tipos.ts`) viven en código, son orientativos y no se guardan.

**RLS**: dueño `all` (`mediciones_all_self`); cuidador con vínculo aceptado `select` vía `es_cuidador_de(usuario_id)`; insert/update/delete vía `puede_editar_de(usuario_id)` (rol `editar`). Tests: `supabase/tests/mediciones.sql`.

## `recetas`

"Nueva receta · retirar en farmacia" de Rutina → Próximos (`023_rutina_detalles.sql`, aplicada 2026-10-22).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users, on delete cascade |
| nombre | text | 1–120 caracteres (medicamento) |
| detalle | text | opcional, máx. 200 |
| fecha | date | día en que hay que retirarla |
| retirada | boolean | default false |
| created_at | timestamptz | |

**RLS**: igual que `mediciones` (dueño `all`; cuidador `select` con `es_cuidador_de`; escritura con `puede_editar_de`). Hoy la UI solo las **lista** (no hay pantalla de alta; ver pendientes en el reporte del paquete 2). Tests: `supabase/tests/rutina-detalles.sql`.

## `consultas` / `vacunas`

Filas del feed "Registros" de Mi Salud (`024_consultas_vacunas.sql`, aplicada 2026-10-22). La UI solo las **lista** (el diseño no tiene pantalla de alta; las puede cargar vita desde el chat más adelante).

| tabla | columnas |
|---|---|
| `consultas` | id, usuario_id (auth.users, cascade), fecha date, especialidad (1–120), profesional?, lugar?, resumen? (máx. 500), origen (`manual` \| `vita`), created_at |
| `vacunas` | id, usuario_id, nombre (1–120), fecha date, dosis?, lugar?, origen (`manual` \| `vita`), created_at |

`origen` alimenta la etiqueta MANUAL / VITA del feed (estudios = MANUAL, mediciones = VITA; ver `lib/registros/nucleo.ts`). **RLS**: igual que `mediciones`. Tests: `supabase/tests/consultas-vacunas.sql`.

`estudios.valores` (jsonb libre, sin migración) admite por valor, además de `{nombre, valor}`: `unidad`, `rango_min`, `rango_max`, `rango_texto` y `estado` (`normal` \| `alto` \| `bajo`), solo si la extracción por IA los leyó del documento; los estudios viejos sin esos campos se siguen mostrando.

**Migración 026 (`026_estudios_lugar.sql`, aplicada 2026-10-22)**: `estudios.lugar text` — lugar del estudio, que el usuario confirma en el paso de revisión del alta (nombre / fecha / lugar). Sin la migración el estudio se guarda igual y el campo "Lugar" no se muestra. Tests: `supabase/tests/estudios-lugar.sql`.

## `sesiones_chat` / `mensajes_chat`

Historial de chat con vita — sin cambios respecto al pase anterior. Ver `003_chat_historial.sql`.

## `acciones_agente`

Reintentos del chat sin duplicar escrituras (migración 030, escrita, pendiente de aplicar; sin ella el chat funciona, solo sin la protección de reintentos y la confirmación de altas a familiares degrada al flag del modelo; PERO borrar o cambiar el horario de un medicamento desde el chat se rechaza —falla cerrado— hasta aplicarla). Cada mensaje lleva un `pedido_id` generado por la app; antes de ejecutar una tool que escribe, `/api/chat` reclama una fila con el cliente de sesión. La clave es `<destinoId>~<tool>:<campos normalizados>` (persona destino, tool y solo los campos que identifican la acción —dosis, días, hora HH:MM, lugar...—, sin tildes/mayúsculas; no el input entero, que el modelo puede reformular). Si ya existe, no se re-ejecuta y se devuelve el `resultado` guardado al modelo; un claim sin resultado de más de 2 min se considera huérfano y se vuelve a reclamar. En un reintento cuyo primer intento ya guardó la respuesta de vita, el servidor la devuelve sin volver a correr el modelo. Escribir en OTRA persona exige confirmación hecha cumplir por el servidor: sin ella se guarda una fila `pendiente:<clave>` (bajo el pedido actual); solo se ejecuta si el mensaje ACTUAL del usuario es un sí explícito ("sí…", "dale", "Para X"...) y existe una pendiente de otro pedido de menos de 10 min, que se consume y deja un marcador `confirmada:<clave>` para poder reintentar ese pedido. Un rechazo ("no", "cancelar", "para mí") borra todas las pendientes del usuario. Si un reintento repite una respuesta ya guardada, también se re-emiten las tarjetas de las escrituras de ese pedido. **Borrar / cambiar el horario de un medicamento** (`delete_schedule`/`update_schedule`, propio o de un familiar con rol Admin) nunca se ejecuta desde la tool: se resuelve la fila (varias coincidencias sin hora que acierte = se pregunta cuál, nunca la primera), se guarda una fila `tipo = 'confirmacion'` (una por usuario, índice parcial; la nueva reemplaza a la anterior) con `accion` (tool + ids + cambios ya convertidos), `texto`, `snapshot` de lo visto y `vence_at` (10 min), y el usuario la confirma con un botón (`confirmarId` en el body de `/api/chat`; un "sí" tipeado, solo si es el mensaje entero, también vale). El servidor la consume (delete…select por id), revisa vencimiento, rol y que la fila siga igual al snapshot, y ejecuta por id con `eliminarHorario`/`actualizarHorario`, sin modelo; el claim `ejecutada:<id>` hace idempotente el pedido. Cancelar, un "no" o cualquier otro mensaje borran la pendiente antes de correr el modelo. Falla cerrado: sin tabla o con cualquier error no se ejecuta (no vale el flag `confirmado` del modelo). No hay job de limpieza todavía (pendiente). Tests: `supabase/tests/acciones-agente.sql`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK `auth.users` on delete cascade | dueño |
| `pedido_id` | uuid not null | el del mensaje del usuario |
| `clave` | text not null | `destinoId~tool:campos normalizados`; o `pendiente:<esa clave>` / `confirmada:<esa clave>` (filas de confirmación, sin `resultado`) |
| `resultado` | jsonb | `{contenido, accionUI}`; null mientras se ejecuta |
| `created_at` | timestamptz | índice para limpieza por antigüedad |
| `tipo` | text not null default `'claim'` | `'claim'` (dedupe/marcadores) o `'confirmacion'` (acción destructiva pendiente); índice único parcial por `usuario_id` donde `tipo = 'confirmacion'` |
| `accion` | jsonb | confirmación: `{tool, destinoId, medicamentoId, persona, cambios?}` |
| `texto` | text | confirmación: la pregunta que se le mostró al usuario |
| `snapshot` | jsonb | confirmación: `{id, nombre, dosis, hora_programada, dias_recurrentes}` visto al proponer |
| `vence_at` | timestamptz | confirmación: `created_at` + 10 min |

`unique (usuario_id, pedido_id, clave)`. RLS owner-only (select/insert/update/delete propios). `mensajes_chat` no cambia: en un reintento el servidor no reinserta el mensaje si ya es el último del usuario en la sesión.

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

Vínculo entre un elder (dueño de los datos) y un cuidador. Ver `008_cuidadores.sql`; roles y permisos de escritura desde `021` (sección Familia).

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

**RLS aditiva sobre datos del elder** (coexiste con `medicamentos_all_self` / `medicamentos_tomas_all_self`, no las reemplaza — Postgres evalúa todas las policies del mismo comando con OR): `medicamentos_select_cuidador` y `medicamentos_tomas_select_cuidador` — el cuidador con vínculo `estado = 'aceptado'` puede leer (`select` únicamente) los `medicamentos`/`medicamentos_tomas` del elder vinculado. (Antes de 021: solo select y sin policy en `perfiles`. Desde 021 estas policies se reemplazaron por las de la sección Familia.)

**RPCs** (`security definer`, `search_path` fijado, `execute` revocado de `public`/`anon` y otorgado solo a `authenticated`):
- `reclamar_invitacion_cuidador(p_token text) returns table (elder_id uuid, nombre text)` — nunca recibe `cuidador_id` como parámetro, siempre usa `auth.uid()` internamente. Valida token existente + `estado = 'pendiente'`, no expirado, y `email_invitado` coincide (case-insensitive) con el email de la cuenta autenticada; si pasa, marca `cuidador_id = auth.uid()`, `estado = 'aceptado'`, `aceptado_at = now()`.
- `listar_elders_vinculados() returns table (elder_id uuid, nombre text)` — elders con vínculo aceptado hacia el cuidador autenticado; única fuente de "nombre del elder" para el cuidador.

### Familia (`021_familia.sql`)

Columnas nuevas: `rol text not null default 'editar'` (check `editar`/`ver` — qué puede hacer el CUIDADOR; lo decide la persona cuidada) y `relacion text` (libre, "Mamá"). Los vínculos existentes quedaron `editar` (= comportamiento previo).

Helpers `security definer stable` (search_path fijado, solo `authenticated`): `es_cuidador_de(p_elder)` (vínculo aceptado de `auth.uid()` hacia `p_elder`) y `puede_editar_de(p_elder)` (ídem + `rol = 'editar'`). Ambos ignoran explícitamente una fila autovinculada (016).

RLS del cuidador (aditiva; las `_all_self` no se tocan; las de cuidador de 008/010/014 se reemplazaron porque no distinguían rol): lectura con `es_cuidador_de`, escritura con `puede_editar_de` en `medicamentos` (select/insert/update/delete), `medicamentos_tomas` (select/insert/update/delete), `turnos` (select/insert/update/delete), `inventario_pastillas` (select/insert/update/delete; `ajustar_stock_pastillas` ahora exige `editar` al cuidador), `estudios` (select/insert/delete) + `storage.objects` del bucket `estudios` bajo `{elder_id}/` (select/insert/delete), `perfiles` (ver arriba), `preferencias_avisos` (select/insert/update). `codigos_acceso_insert_cuidador` ahora exige `editar` (un código de acceso abre sesión COMO esa persona).

RPCs nuevas (`returns table` con columnas calificadas): `listar_familia()` (personas que cuido: vínculo, nombre, color, rol, relación, `conectado` = `auth.users.last_sign_in_at is not null`), `listar_mis_cuidadores()` (quién me cuida, con nombre y rol), `cambiar_rol_cuidador(p_vinculo_id, p_rol)` (solo la persona cuidada; `vinculos_all_elder` bloquea el update directo de una fila aceptada), `dejar_de_cuidar(p_vinculo_id)` (el cuidador revoca su propio vínculo aceptado).

**Perfil gestionado** (persona sin celular): cuenta real de `auth.users` con email placeholder `gestionado-<uuid>@usuarios.soyvita.com.ar`, creada por `crearPerfilGestionado` (`lib/familia/nucleo.ts`, admin client) junto con su `perfiles` y un vínculo ya `aceptado` con `rol = 'editar'`. Más adelante entra desde su celular con un código de `codigos_acceso`. Reemplaza `perfiles_pendientes` para flujos nuevos (el camino viejo sigue funcionando).

### Cuidadores de una persona (`027_cuidadores_de_persona.sql`)

Hasta 021 solo la persona cuidada veía a sus cuidadores y solo ella cambiaba permisos o los revocaba; un cuidador no veía a los demás porque la RLS de `vinculos_cuidador` solo le muestra sus propias filas. 027 agrega RPCs `security definer` (search_path fijado, solo `authenticated`, columnas calificadas) con estas reglas:

- **Ver** la lista: la propia persona o un cuidador `aceptado` de ella. Cualquier otro recibe vacío.
- **Gestionar** (invitar, cambiar permiso, quitar): la propia persona, o un cuidador con `rol = 'editar'` (Admin) **solo si la persona es un perfil gestionado** (`auth.users.raw_app_meta_data.tipo = 'perfil_gestionado'`; app_metadata y no user_metadata, porque el cliente puede reescribir user_metadata). Sobre una persona con cuenta propia decide únicamente ella. Nadie cambia su propio permiso ni se quita a sí mismo por estas RPCs (para salir está `dejar_de_cuidar`).

Columna nueva: `vinculos_cuidador.nombre_invitado text` (cómo el invitador llama al invitado; se muestra mientras la invitación está pendiente).

Funciones: `es_perfil_gestionado(p_id)`, `puede_gestionar_cuidadores(p_elder)`, `listar_cuidadores_de(p_elder)` (aceptados + invitaciones pendientes vigentes; devuelve `vinculo_id, cuidador_id, nombre, rol, relacion, estado, es_yo, puede_gestionar` y, solo a quien gestiona, `email`, `token` de la pendiente, `expira_at`, `aceptado_at`), `invitar_cuidador(p_elder, p_email, p_nombre, p_relacion, p_rol)` (crea o reemite la pendiente al mismo mail; valida email/rol; rechaza si ya la cuida ese mail; devuelve `vinculo_id, token, expira_at`), `cambiar_rol_cuidador(p_vinculo_id, p_rol)` (misma firma que 021, ahora con las reglas de arriba y también sobre pendientes) y `quitar_cuidador(p_vinculo_id)` (revoca un aceptado o cancela un pendiente de OTRA persona). Tests: `supabase/tests/cuidadores-de-persona.sql`.

Re-invitar a alguien quitado funciona: 027 recrea `idx_vinculo_unico` como `(elder_id, cuidador_id) where cuidador_id is not null and estado <> 'revocado'` (antes el vínculo revocado bloqueaba el claim), y agrega `idx_vinculo_invitacion_pendiente` (una sola invitación pendiente por persona y mail).

## `alertas_dosis`

Log + dedupe de alertas de dosis vencida (una fila por `(medicamento_id, fecha)` evita reenvíos del cron). Ver `008_cuidadores.sql`. Sin policies propias — RLS habilitada sin ninguna policy, solo accesible vía `service_role` (cron route `app/api/cron/dosis-vencidas`).

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| medicamento_id | uuid | references medicamentos, on delete cascade |
| fecha | date | |
| enviado_at | timestamptz | |
| destinatarios | int | cantidad de cuidadores notificados |
| estado | text | check: enviado / error |
| error | text | detalle si `estado = 'error'` |
| push_enviados | int | push entregados a cuidadores (017) |
| push_fallidos | int | push que fallaron por un motivo distinto de suscripción muerta (017) |

unique `(medicamento_id, fecha)`. Desde la 017 `fecha` es la fecha de pared **AR** de la dosis (no UTC), así una dosis sin tomar no vuelve a alertar al cruzar las 21:00 AR; `destinatarios` cuenta cuidadores.

## `push_suscripciones`

Una fila por navegador/dispositivo suscripto a Web Push. Ver `017_push_notificaciones.sql`.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | references auth.users, on delete cascade |
| endpoint | text | único |
| p256dh, auth | text | claves de la suscripción |
| user_agent | text | |
| created_at, last_used_at | timestamptz | |

**RLS**: owner-only (`select`/`insert`/`update`/`delete` con `usuario_id = auth.uid()`). El upsert por `endpoint` pasa por la RPC `registrar_push_suscripcion(...)` (`security definer`, siempre `auth.uid()`) porque un navegador compartido puede cambiar de cuenta y la fila vieja es de otro usuario. Enviar a OTRO usuario requiere `service_role` (cron, y `recordarDosisAlElder` después de validar el vínculo).

## `recordatorios_dosis`

"Recordarle" del cuidador al elder por una dosis pendiente. Sirve de rate-limit (1 por dosis cada 15 min) y de fuente del aviso dentro de la app. Ver `017_push_notificaciones.sql`.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| medicamento_id | uuid | references medicamentos, on delete cascade |
| elder_id | uuid | references auth.users, on delete cascade |
| cuidador_id | uuid | references auth.users, on delete cascade |
| fecha | date | fecha de pared AR de la dosis |
| created_at | timestamptz | |

**RLS**: insert del cuidador solo con `cuidador_id = auth.uid()`, vínculo `aceptado` hacia ese elder y medicamento que pertenece al elder; select de los cuidadores vinculados al elder (rate-limit por dosis) y del propio elder.

## `avisos`

Feed del centro de notificaciones (`/app/avisos`): una fila por aviso entregado a un usuario (con o sin push). Ver `020_avisos.sql`.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| usuario_id | uuid | destinatario; references auth.users, on delete cascade |
| tipo | text | `dosis`, `dosis_segundo`, `dosis_pospuesta`, `dosis_vencida_cuidador`, `dosis_resuelta_cuidador`, `recordatorio_familiar`, `turno_dia_antes`, `turno_2h`, `stock_bajo`, y (028) `resumen_dia_persona`, `turno_persona_dia_antes`, `stock_bajo_persona`, `persona_en_vita` |
| titulo, cuerpo | text | |
| url | text | ruta interna a abrir al tocar |
| datos | jsonb | |
| persona_id | uuid null | (028) persona cuidada a la que se refiere un aviso del feed de un cuidador; null = aviso propio. references auth.users, on delete cascade; índice `(usuario_id, persona_id, created_at desc)` |
| leido_at | timestamptz | null = sin leer |
| created_at | timestamptz | índice `(usuario_id, created_at desc)` |

**RLS**: select/update/delete owner-only; sin policy de insert (escribe solo `service_role`: cron y "Recordarle"). El único campo actualizable por el usuario es `leido_at` (column grant).

## `preferencias_avisos`

| columna | tipo | notas |
|---|---|---|
| usuario_id | uuid PK | references auth.users, on delete cascade; sin fila = defaults del código |
| silencio_desde, silencio_hasta | time | ambos null = sin silencio; pueden cruzar la medianoche (check: ambos o ninguno) |
| espera_cuidador_min | int | 30 / 60 / 120 (default 30); minutos antes de avisar al cuidador |
| recordatorio_dosis, aviso_turnos, stock_bajo | boolean | default true |
| pendiente_persona, resumen_dia, stock_persona | boolean | (028) como CUIDADOR: avisarme si la persona no confirma / resumen 21:00 / stock bajo de la persona (solo Admin). Default true |
| turnos_persona | boolean | (028) turno de la persona mañana. Default false |
| updated_at | timestamptz | |

**RLS**: owner-only (`for all`) + la 021 deja a un cuidador Admin editar la fila de la persona (la espera). Sin la 028 la app lee/escribe solo las columnas de la 020 y los avisos de familia quedan apagados.

## `posposiciones`

"En 15 min" del lado del servidor (acción del push, modo simple). Cuando `hasta` pasa y la dosis sigue sin tomarse, el cron vuelve a avisar.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| medicamento_id | uuid | references medicamentos, on delete cascade |
| usuario_id | uuid | references auth.users, on delete cascade |
| fecha | date | fecha de pared AR de la dosis |
| hasta | timestamptz | |
| created_at | timestamptz | |

**RLS**: select/delete owner-only; insert exige `usuario_id = auth.uid()` y que el medicamento sea propio.

## `preferencias_modo_simple`

(029) Cómo ve la PERSONA su pantalla de modo simple (`/app/modo-simple`); la configura ella o un cuidador Admin desde `/app/familia/[id]/modo-simple`. Sin fila = defaults del código (`lib/modo-simple/tipos.ts`).

| columna | tipo | notas |
|---|---|---|
| usuario_id | uuid PK | la persona cuidada; references auth.users, on delete cascade |
| ver_turnos, ver_mediciones, charlar, ayuda | boolean | default true: tarjeta de turnos, mediciones, "Hablar con Vita", botón rojo Ayuda |
| voz, voz_lenta | boolean | default true / false: leerle los avisos y el botón Escuchar; voz más lenta (se aplica con `playbackRate`) |
| posponer, posponer_min | boolean, int | default true / 15; "Más tarde" on/off y 15/30/60 min (los minutos viajan a `posposiciones.hasta`) |
| llamar_nombre, llamar_telefono | text | a quién llama Ayuda; ambos null = su contacto de emergencia. Copia hecha por quien configura (ver el comentario de la migración) |
| updated_at | timestamptz | |

**RLS**: dueño `for all`; cuidador aceptado `select` (`es_cuidador_de`); `insert`/`update` con `puede_editar_de` (rol `editar`). Nadie borra. Tests: `supabase/tests/modo-simple-prefs.sql`.

## `envios_avisos`

Dedupe claim-before-send de los avisos programados: `unique (tipo, ref_id, fecha)` (`ref_id` = medicamento, turno, inventario o posposición según `tipo`; `fecha` = fecha AR). Columnas: `id`, `tipo`, `ref_id`, `fecha`, `usuario_id`, `created_at`. **RLS** habilitada sin policies: solo `service_role`. Los avisos de familia son por cuidador: su `ref_id` es un uuid determinista de (persona, cuidador[, turno/inventario]) y `tipo` es text libre (sin check). El cron borra claims de más de 7 días. `alertas_dosis` suma `resuelta_at` (cuándo se avisó al cuidador que el elder ya tomó).

## `codigos_acceso`

Código de re-ingreso de un solo uso (15 min) que el cuidador genera para la persona cuidada (cuenta creada por código, o cuenta de Google que cambió de celular). Solo se guarda el hash. Ver `019_codigos_acceso.sql`.

| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| elder_id | uuid | references auth.users, on delete cascade |
| cuidador_id | uuid | references auth.users, on delete cascade; check `elder_id <> cuidador_id` |
| codigo_hash | text | sha256 hex de `salt || código de 6 dígitos` |
| salt | text | por fila |
| expira_at | timestamptz | creación + 15 min |
| usado_at | timestamptz | null hasta el canje |
| created_at | timestamptz | |

**RLS**: insert/select del cuidador solo con `cuidador_id = auth.uid()` y vínculo `aceptado` hacia ese elder. Sin policies de update/delete: el canje (`usado_at`, atómico con `where usado_at is null`) lo hace `service_role` desde la Server Action de /login.

## `intentos_codigo`

Throttling anti fuerza bruta de /login por código: `id` (identity), `ip_hash` (HMAC-SHA256 de la IP con secreto del servidor, nunca la IP cruda), `creado_at`. Máx. 10 intentos por IP en 15 min; limpieza oportunista de filas de más de 1 día. **RLS habilitada sin policies** y `revoke all` a `anon`/`authenticated`: solo `service_role`.

## `registros_chat`

Un registro por respuesta del chat con vita (migración `033`, escrita, NO aplicada): latencia, vueltas del modelo, tools usadas, tokens reales y errores, más `version_prompt` (hash de 12 hex de la plantilla estática del system prompt + tools + modelo). **No guarda** texto de mensajes, inputs/outputs de tools ni mensajes de error crudos. Columnas: `id`, `usuario_id` (cascade), `pedido_id`, `sesion_id` (uuid sin FK), `created_at`, `version_prompt`, `modelo`, `latencia_ms`, `latencia_primer_token_ms` (null sin texto), `vueltas_modelo`, `tools text[]` (solo nombres), `escrituras`, `tokens_entrada/salida/cache_lectura/cache_escritura`, `resultado` (`ok|error|limite|confirmacion|cancelacion|replay`), `error_codigo` (corto: `anthropic_529`, `timeout`, `tiempo` = cortada por el presupuesto de tiempo, `pedidos` = límite de pedidos con `resultado='limite'`, `stream_abort`, `db`, `interno`). **RLS** habilitada sin policies: solo `service_role` (best-effort, vía `after`). Índices por `created_at` y `(usuario_id, created_at)`. Retención de 90 días: seguimiento manual (pg_cron), no implementado. Consultas: `supabase/queries/registros-chat-resumen.sql`.

## Fuera de alcance (sin tabla, decisión — ver CLAUDE.md)

- Login con Apple.

Rol Cuidador / vínculo con otro usuario ya no está fuera de alcance — ver `vinculos_cuidador`/`alertas_dosis` arriba (`008_cuidadores.sql`, ampliado en `021` con Familia).

## `limites_pedidos`

Contador de pedidos por ventana fija para limitar `/api/chat` y `/api/voz/*` por usuario y por IP (migración `034`, escrita, NO aplicada; distinto del límite diario de tokens de `uso_ia_diario`). Columnas: `clave text` (`<endpoint>:<u|ip>:<usuario_id o HMAC de la IP>:<min|dia>`; la IP nunca se guarda cruda, se hashea como en `intentos_codigo`), `ventana_inicio timestamptz` (minuto UTC o inicio del día en Argentina), `cuenta int`; PK `(clave, ventana_inicio)`. La función `contar_pedido(p_clave, p_ventana_inicio)` (`security definer`, `execute` solo para `service_role`) hace el upsert atómico y devuelve la cuenta. **RLS** habilitada sin policies: solo `service_role`. Si la tabla falta o la DB falla, la app falla abierto. Retención: borrar ventanas de más de 2 días a mano (pg_cron), no implementado.
