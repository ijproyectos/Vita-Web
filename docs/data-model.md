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

## Fuera de alcance (sin tabla, decisión — ver CLAUDE.md)

- Métricas de salud (presión, glucemia, peso) — "Monitoreo activo" en Mi Salud.
- Vacunas / consultas — timeline de "Historial" en Mi Salud (a diferencia de Estudios, que sí tiene tabla).
- Rol Cuidador / vínculo con otro usuario.
- Login con Apple.
