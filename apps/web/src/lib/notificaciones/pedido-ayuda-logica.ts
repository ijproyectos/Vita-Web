// Parte PURA del pedido de ayuda a la familia (sin I/O, testeable sin Supabase).
// Sin `server-only` a propósito: la importan la tool del chat y los tests.
import { limpiarDato } from "@/lib/ai/limpiar";
import { unirNombres } from "@/lib/modo-simple/respuestas";

/** Ventana (minutos) del tope de pedidos por persona y de la deduplicación por motivo. */
export const MINUTOS_ENTRE_PEDIDOS_AYUDA = 15;
/** Tope duro de pedidos por persona dentro de la ventana, sin importar el motivo. */
export const MAX_PEDIDOS_AYUDA_POR_VENTANA = 3;
/** Plazo por cuidador para entregar el aviso (un push lento no puede pasar el timeout del cliente). */
export const TIMEOUT_ENTREGA_AYUDA_MS = 5_000;
export const MAX_MOTIVO = 140;

export type ResultadoPedidoAyuda =
  | { status: "enviado"; nombres: string[] }
  | { status: "sin-cuidadores" }
  | { status: "repetido"; nombres: string[] }
  /** Hard cap hit with a NEW motivo: nothing was sent this time. */
  | { status: "tope" }
  | { status: "error"; message: string };

/** El motivo lo escribe el modelo a partir de lo que dijo la persona: sin control chars, 1 línea, tope. */
export function limpiarMotivo(crudo: unknown): string {
  if (typeof crudo !== "string") return "";
  return crudo
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MOTIVO)
    .trim();
}

/** Clave para comparar motivos: sin espacios de más, en minúsculas, con tildes (distinguen palabras). */
export function normalizarMotivo(motivo: string): string {
  return motivo.replace(/\s+/g, " ").trim().toLowerCase();
}

export type AvisoReciente = { motivoClave: string | null; destinatarioId: string };

/**
 * Un pedido es "repetido" solo si ya hay uno reciente con el MISMO motivo. Un motivo distinto
 * dentro de la ventana es una escalada ("mareada" y después "me duele el pecho") y se entrega.
 */
export function esPedidoRepetido(recientes: AvisoReciente[], motivo: string): boolean {
  const clave = normalizarMotivo(motivo);
  return recientes.some((r) => r.motivoClave === clave);
}

/**
 * Tope duro: cada pedido deja una fila por cuidador, así que los pedidos distintos son las
 * "tandas" (se cuentan por el destinatario con más filas). Con >= MAX no se manda otro.
 */
export function superaTopePedidos(recientes: AvisoReciente[]): boolean {
  const porDestinatario = new Map<string, number>();
  for (const r of recientes) porDestinatario.set(r.destinatarioId, (porDestinatario.get(r.destinatarioId) ?? 0) + 1);
  return Math.max(0, ...porDestinatario.values()) >= MAX_PEDIDOS_AYUDA_POR_VENTANA;
}

/** Destinatarios que ya recibieron el aviso anterior con el mismo motivo. */
export function destinatariosDelRepetido(recientes: AvisoReciente[], motivo: string): string[] {
  const clave = normalizarMotivo(motivo);
  return [...new Set(recientes.filter((r) => r.motivoClave === clave).map((r) => r.destinatarioId))];
}

function nombresParaModelo(nombres: string[]): string {
  const lista = nombres.map((n) => limpiarDato(n, 40)).filter(Boolean);
  return unirNombres(lista) || "su familia";
}

/** Lo que vuelve al modelo como tool_result: explícito sobre si se avisó o no (nunca afirma de más). */
export function textoPedidoAyudaParaModelo(r: ResultadoPedidoAyuda): string {
  switch (r.status) {
    case "enviado":
      return `ENVIADO: la app le avisó de verdad a ${nombresParaModelo(r.nombres)} (aviso en la app y notificación). Decíselo con ese nombre y tranquilizala en una frase. Si lo que cuenta suena grave, agregá que toque el botón Ayuda para llamar.`;
    case "repetido":
      return `YA AVISADO: hace pocos minutos ya se le avisó a ${nombresParaModelo(r.nombres)} y no se mandó otro aviso. Decile que ya les avisaste y que enseguida se van a comunicar. Si suena grave, que toque el botón Ayuda para llamar.`;
    case "tope":
      return "NO SE MANDÓ ESTE AVISO: ya se mandaron varios pedidos en los últimos minutos y no se pudo mandar otro. NO digas que avisaste ni que les va a llegar. Decile que llame ahora mismo a su familia, o al 107 si es una emergencia, o que toque el botón rojo Ayuda.";
    case "sin-cuidadores":
      return "NO SE AVISÓ A NADIE: no tiene familiares vinculados en vita. NO digas que avisaste a alguien. Decile que toque el botón Ayuda para llamar a su contacto.";
    case "error":
      return "NO SE PUDO AVISAR por un error temporal. NO digas que avisaste a alguien. Decile que toque el botón Ayuda para llamar a su contacto.";
  }
}

/** Evento SSE para la pantalla: `ayuda_enviada` solo cuando el servidor confirmó que hay aviso (nuevo o reciente); `ayuda_tope` cuando no se pudo mandar otro. */
export function accionPedidoAyuda(
  r: ResultadoPedidoAyuda
): { type: "ayuda_enviada"; nombres: string[] } | { type: "ayuda_tope" } | undefined {
  if (r.status === "enviado" || r.status === "repetido") return { type: "ayuda_enviada", nombres: r.nombres };
  // Cap reached: nothing was sent, so the screen must highlight the red Ayuda button (never "X recibió tu pedido").
  if (r.status === "tope") return { type: "ayuda_tope" };
  return undefined;
}
