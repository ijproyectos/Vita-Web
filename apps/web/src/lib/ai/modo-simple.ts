// Chat de modo simple: estilo de respuesta + tools permitidas. PURO (sin server-only, sin I/O):
// lo usa /api/chat y lo prueban los tests. El prompt estático (SYSTEM_PROMPT, cacheado) NO se toca:
// el estilo simple va en el bloque DINÁMICO.
import type Anthropic from "@anthropic-ai/sdk";
import { TOOL_PROPONER_MEDICION, TOOL_SUGERIR_LLAMAR_AYUDA, TOOLS } from "./tools-definiciones";

const SUGERIR_AYUDA = TOOL_SUGERIR_LLAMAR_AYUDA.name;
const PROPONER_MEDICION = TOOL_PROPONER_MEDICION.name;

export type ModoChat = "normal" | "simple";

/** Solo `"simple"` activa el modo; cualquier otra cosa es el chat normal. */
export function leerModoChat(valor: unknown): ModoChat {
  return valor === "simple" ? "simple" : "normal";
}

/** Tools que existen únicamente en el modo simple: en el normal no se ofrecen ni se ejecutan. */
export const TOOLS_SOLO_SIMPLE: ReadonlySet<string> = new Set([SUGERIR_AYUDA, PROPONER_MEDICION]);

/** Lo único que puede usar el modo simple (lectura + avatar + sugerir llamar y proponer medición). */
export const TOOLS_PERMITIDAS_SIMPLE: ReadonlySet<string> = new Set([
  "list_today_medications",
  "list_today_appointments",
  "set_avatar_mood",
  SUGERIR_AYUDA,
  PROPONER_MEDICION,
]);

/** Tools que se le ofrecen al modelo en cada modo (el normal queda idéntico a `TOOLS`). */
export function toolsParaModo(modo: ModoChat): Anthropic.Tool[] {
  if (modo === "normal") return TOOLS;
  const todas = [...TOOLS, TOOL_SUGERIR_LLAMAR_AYUDA, TOOL_PROPONER_MEDICION];
  return todas.filter((t) => TOOLS_PERMITIDAS_SIMPLE.has(t.name));
}

/** Defensa en profundidad: aunque el modelo nombre una tool que no se le ofreció, no se ejecuta. */
export function toolPermitida(modo: ModoChat, nombre: string): boolean {
  return modo === "simple" ? TOOLS_PERMITIDAS_SIMPLE.has(nombre) : !TOOLS_SOLO_SIMPLE.has(nombre);
}

/** Result of `sugerir_llamar_ayuda` for the model. No notice is sent to anyone (owner decision 2026-10-29). */
export const TEXTO_SUGERIR_LLAMAR_AYUDA =
  "No se envió ningún aviso a nadie. Decile con calidez que llame ahora a su familia, o al 107 si es una emergencia; la pantalla ya le muestra el botón rojo para llamar. NUNCA digas que avisaste ni que ya saben.";

export const RESULTADO_TOOL_NO_DISPONIBLE = "Esa herramienta no está disponible ahora. No la uses; respondé sin ella.";

/** Respuesta a una tool que el modo no permite (o `null` si se puede ejecutar). Lo usa /api/chat por cada uso. */
export function resultadoToolBloqueada(modo: ModoChat, uso: { id: string; name: string }): Anthropic.ToolResultBlockParam | null {
  if (toolPermitida(modo, uso.name)) return null;
  return { type: "tool_result", tool_use_id: uso.id, content: RESULTADO_TOOL_NO_DISPONIBLE, is_error: true };
}

/** Bloque que se agrega al contexto dinámico cuando `modo === "simple"`. */
export const INSTRUCCIONES_ESTILO_SIMPLE = `

MODO SIMPLE (tiene prioridad sobre el estilo habitual): te habla una persona mayor, por voz, en una pantalla muy simple. Tu respuesta se lee en letra grande y se dice en voz alta.
- Respondé en 1 o 2 frases MUY cortas, cálidas, con palabras simples y en voseo. Nada de listas, viñetas, markdown, emojis ni paréntesis.
- Decí las horas en palabras ("a las 10 de la mañana", "a las 8 de la noche"), nunca "10:00" ni "20:00".
- Preguntas médicas o cambios de medicación (dosis, dejar o cambiar un remedio): no opines; decile con cariño que lo consulte con su médico.
- Si dice que se siente mal, cuenta un síntoma, pide ayuda o pide que le consigan un turno: llamá a ${SUGERIR_AYUDA}. Esa tool NO avisa a nadie: decile con cariño que llame ahora a su familia (la pantalla le muestra el botón rojo), o al 107 si es una emergencia. Nunca digas que avisaste ni que ya saben.
- Si lo que cuenta suena grave (dolor de pecho, falta de aire, desmayo, caída fuerte), llamá a ${SUGERIR_AYUDA} y decile que llame ya al 107, y después a su familia.
- Si dice un valor de glucosa o de presión ("me dio 110", presión "13 y 8" = 130 y 80): llamá a ${PROPONER_MEDICION} (glucemia o presion; en la presión, valor = la máxima y valor_secundario = la mínima). NO digas que quedó anotado. Si el resultado de la tool confirma la propuesta, la pantalla le va a preguntar "¿Lo anoto así?": recién ahí decile algo breve como "Fijate en la pantalla y confirmame si está bien". Si el resultado dice que el valor no es válido, no lo mandes a la pantalla: pedile que te repita el valor.
- Seguí llamando a set_avatar_mood en cada respuesta.`;

/** Bloque dinámico del system prompt según el modo: el simple suma su estilo al final, el normal queda igual. */
export function contextoDinamicoParaModo(modo: ModoChat, contextoDinamico: string): string {
  return modo === "simple" ? `${contextoDinamico}${INSTRUCCIONES_ESTILO_SIMPLE}` : contextoDinamico;
}
