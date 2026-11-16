// "Recordarle" desde el chat (tool remind_dose): lógica pura, sin I/O. El texto que vuelve al modelo dice
// con precisión qué pasó; el modelo nunca debe afirmar que se avisó si no hubo al menos un "enviado".
import { limpiarDato } from "@/lib/ai/limpiar";

export type ResultadoRecordatorioLogica =
  | { status: "enviado" }
  | { status: "repetido" }
  | { status: "sin-avisos" }
  | { status: "ya-tomada" }
  | { status: "error"; message: string };

/** Tope de dosis por pedido (mismo orden de magnitud que la lista "Hoy" de una persona). */
export const MAX_DOSIS_POR_RECORDATORIO = 6;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `medication_ids` del modelo: lista de uuids sin repetir y ordenada; `null` = no vino; `"invalido"` = mal formada. */
export function leerIdsDosis(crudo: unknown): string[] | null | "invalido" {
  if (crudo === undefined || crudo === null) return null;
  if (!Array.isArray(crudo) || !crudo.every((x) => typeof x === "string" && UUID.test(x.trim()))) return "invalido";
  const ids = [...new Set((crudo as string[]).map((x) => x.trim().toLowerCase()))].sort();
  return ids.length === 0 ? null : ids;
}

export type DosisPendienteChat = { id: string; nombre: string; hora: string };

/** La pregunta que ve el usuario antes de enviar nada. */
export function textoPropuestaRecordatorio(persona: string, dosis: DosisPendienteChat[]): string {
  const lista = dosis.map((d) => `${limpiarDato(d.nombre)} de las ${d.hora.slice(0, 5)}`).join(", ");
  return `¿Le mando un recordatorio a ${limpiarDato(persona)} por ${lista}?`;
}

/** Resumen veraz de varios envíos. `enviadas` y los nombres salen solo de lo que el servidor confirmó. */
export function resumirRecordatorios(
  persona: string,
  resultados: { nombre: string; r: ResultadoRecordatorioLogica }[]
): { texto: string; enviadas: number } {
  const quien = limpiarDato(persona);
  const enviadas = resultados.filter((x) => x.r.status === "enviado");
  const repetidas = resultados.filter((x) => x.r.status === "repetido").length;
  const tomadas = resultados.filter((x) => x.r.status === "ya-tomada").length;
  const sinAvisos = resultados.some((x) => x.r.status === "sin-avisos");
  const error = resultados.find((x) => x.r.status === "error");
  const partes: string[] = [];
  if (enviadas.length > 0) {
    partes.push(`Recordatorio ENVIADO a ${quien} por: ${enviadas.map((x) => limpiarDato(x.nombre)).join(", ")}.`);
  }
  if (repetidas > 0) partes.push(`${repetidas === 1 ? "Una dosis ya tenía" : `${repetidas} dosis ya tenían`} un recordatorio de hace menos de 15 minutos: no se mandó otro.`);
  if (tomadas > 0) partes.push(`${tomadas === 1 ? "Una dosis ya estaba tomada" : `${tomadas} dosis ya estaban tomadas`}: no hacía falta avisar.`);
  if (sinAvisos) partes.push(`${quien} no tiene avisos activados en su celular, así que NO le llegó nada de eso. Sugerile una llamada o un mensaje.`);
  if (error && error.r.status === "error") partes.push(`No se pudo enviar por un error: ${limpiarDato(error.r.message, 120)}`);
  if (enviadas.length === 0) partes.push("NO afirmes que le avisaste.");
  return { texto: partes.join(" "), enviadas: enviadas.length };
}

export const TEXTO_NADA_PENDIENTE_RECORDAR =
  "No hay dosis pendientes de hoy para recordarle (todas están tomadas o todavía no es su hora). No se mandó nada ni se pide confirmación.";
export const TEXTO_SOLO_OTRAS_PERSONAS =
  "remind_dose es solo para personas que el usuario cuida: pasá el persona_id exacto de la lista de Personas. No se mandó nada.";
export const TEXTO_SIN_CELULAR_RECORDAR = (persona: string) =>
  `${limpiarDato(persona)} todavía no conectó su celular, así que no le puede llegar un aviso. No se mandó nada: ofrecé conectar su celular desde su ficha, o una llamada o un mensaje.`;
