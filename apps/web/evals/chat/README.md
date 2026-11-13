# Eval de regresión del agente vita (chat)

Revisa el PRIMER turno del modelo (y, en casos de 2 pasos, un segundo turno con un `tool_result` enlatado) para ~44 conversaciones guionadas. Usa las piezas REALES de producción: `SYSTEM_PROMPT` con `cache_control`, el array `TOOLS` (o las tools del modo simple vía `toolsParaModo`) y el bloque dinámico armado con `contextoDinamicoChat` + `construirContextoPersonas` + `bloqueHoy`, alimentados con datos falsos (Elsa, mamá Rosa con rol Admin, papá Beto como Lector, fecha fija miércoles 28/10/2026 10:30).

Las tools **no se ejecutan**: no hay Supabase, ni RLS, ni confirmación real del servidor. Se califica lo que el modelo decide (tool, campos, persona_id, texto). Los resultados enlatados de confirmación usan los mismos mensajes que el servidor (`mensajeEsperandoConfirmacion`, `mensajeFaltaConfirmacion`).

> Convive con el set anterior `apps/web/evals/` (`npm run evals`). Este es más amplio en categorías (familia, emergencias, modo simple, juez de tono), corre con concurrencia y escribe un reporte JSON.

## Qué cubre

| Categoría | Qué verifica |
| --- | --- |
| medicamentos | alta con dosis y dos horas, pedido ambiguo, marcar tomado, "qué me toca hoy", resumen del día |
| confirmacion | borrar/cambiar horario o turno: nunca afirma "ya lo borré"; usa el id real del turno; resiste instrucciones escondidas en un tool_result |
| familia | `persona_id` correcto, perfil abierto sin destino, rol Lector, nombre fuera de la lista |
| emergencias | 107/911, línea 135, 0800-333-0160, sin spam de tools |
| mediciones, turnos, lecturas | add_measurement, fechas relativas, stock, estudios sin diagnosticar, adherencia |
| limites | no receta dosis, no sugiere dejar un remedio, fuera de tema |
| memoria | alergia -> perfil (`add_allergy`), hechos -> `recordar`, ánimo -> pasajero |
| modo-simple | `pedir_ayuda_familia`, no miente sobre el aviso, respuestas cortas, `proponer_medicion` |
| avatar | `set_avatar_mood` (regla blanda) |
| tono | puntaje 1-5 con juez LLM (`claude-haiku-5-5`), **blando**: no cuenta PASS/FAIL |

Reglas `falla` rompen el caso; reglas `aviso` (p. ej. llamar a `set_avatar_mood` en cada respuesta, que el prompt pide pero no es crítico) se informan sin romperlo.

Nota: el prompt manda las alergias al perfil (`add_allergy`) y no a `recordar`; el caso `mem-alergia-al-perfil` califica eso.

## Cómo correrlo

```bash
cd apps/web
export ANTHROPIC_API_KEY=...        # o ponelo en apps/web/.env.local
npm run eval:chat                                   # los ~44 casos
npm run eval:chat -- --filtro fam-                  # casos cuyo id contiene el texto
npm run eval:chat -- --repeticiones 3               # cada caso 3 veces (PASS solo si pasan las 3)
npm run eval:chat -- --sin-juez                     # sin el juez de tono
```

Se niega a correr sin `ANTHROPIC_API_KEY` (después de mostrar el costo estimado). Imprime una tabla PASS/FAIL por caso, tasa de PASS, tokens, costo real y latencia p50/p90, y escribe `evals/chat/resultados/<timestamp>.json` (carpeta ignorada por git). Exit code 1 si algún caso falla. Concurrencia 4; el primer caso de cada modo corre solo para calentar el caché de prompt.

## Costo

Cálculo: el prefijo cacheado (tools + `SYSTEM_PROMPT`) pesa ~10-12 mil tokens (medido: ~10,4 mil). Un run completo hace ~52 llamadas a Sonnet 5 (44 casos, 8 con segundo turno) más 3 llamadas a Haiku 5.5 del juez. Con caché: 2 escrituras del prefijo (modo normal y simple, a US$2,50/M) + ~50 lecturas (US$0,20/M) + ~900 tokens dinámicos sin caché (US$2/M) + ~250 tokens de salida (US$10/M) por llamada = **~US$0,5 por corrida completa**. Sin caché caliente (primera corrida del día o más de 5 min entre llamadas) puede subir a ~US$0,8. Cada `--repeticiones` extra suma ~US$0,3-0,4. El runner imprime la estimación antes de llamar a la API.

## Cómo agregar un caso

1. En `casos.ts`, sumá un `caso({...})` a `CASOS` con `id` único, `categoria`, `mensaje`, `contexto` (`CTX_SOLA`, `CTX_FAMILIA`, `CTX_ROSA_ABIERTA`, ...) y `reglas` (`llama`, `noLlama`, `sinEscritura`, `texto`, `sinTexto`, `pregunta`, `custom`, ...).
2. Para 2 pasos agregá `segundo: { resultadosTool: { <tool>: "<resultado>" }, reglas: [...] }`.
3. Para modo simple, `modo: "simple"`. Para tono, `juez: "criterio"`.
4. Si inventás una regla nueva, agregala a `calificar.ts` con un test en `calificar.test.ts` (corre en CI, sin red).

## Cuándo correrlo

Antes de mergear cualquier PR que toque `lib/ai`, `app/api/chat` o `prompt-chat` (prompt, tools o contexto). Pegá la tasa de PASS en el PR. Los tests de los calificadores (`calificar.test.ts`) sí corren en CI con `npm test`; la corrida contra la API es siempre manual.

## GitHub Actions

`.github/workflows/eval-chat.yml` se dispara solo a mano (`workflow_dispatch`). Requiere que el dueño cargue el secret `ANTHROPIC_API_KEY` en el repositorio (Settings > Secrets and variables > Actions). El reporte JSON se sube como artefacto.
