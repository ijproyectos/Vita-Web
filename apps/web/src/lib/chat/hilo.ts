// Lógica pura del hilo continuo del chat (sin DB ni server-only, para poder probarla y usarla en el cliente).
// Una sola conversación por persona: se muestran y se guardan los últimos 7 días, como WhatsApp.

import { fechaISOEnAR } from "@/lib/rutina/formato";

export const VENTANA_CHAT_DIAS = 7;
export const VENTANA_CHAT_MS = VENTANA_CHAT_DIAS * 24 * 60 * 60 * 1000;
/** Mensajes por página al abrir el chat y al subir a buscar más viejos. */
export const TAMANO_PAGINA_CHAT = 40;

/** Instante (ISO) más viejo que se muestra y se conserva. */
export function inicioVentanaChat(ahoraMs: number): string {
  return new Date(ahoraMs - VENTANA_CHAT_MS).toISOString();
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Día calendario (YYYY-MM-DD) en hora de Argentina de un instante ISO; "" si no es válido. */
export function diaEnAR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fechaISOEnAR(d);
}

function restarDias(fechaISO: string, dias: number): string {
  const [a, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

/** "Hoy", "Ayer" o "lunes 2 de noviembre" (en hora de Argentina) para el separador de un día. */
export function etiquetaDiaChat(iso: string, ahoraMs: number): string {
  const dia = diaEnAR(iso);
  if (!dia) return "";
  const hoy = fechaISOEnAR(new Date(ahoraMs));
  if (dia === hoy) return "Hoy";
  if (dia === restarDias(hoy, 1)) return "Ayer";
  const [a, m, d] = dia.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana} ${d} de ${MESES[m - 1]}`;
}

/**
 * Etiqueta del separador que va ANTES de un mensaje, o null si sigue el mismo día que el anterior.
 * `anteriorIso` es el mensaje inmediatamente previo en pantalla (null = es el primero).
 */
export function separadorAntes(anteriorIso: string | null, iso: string, ahoraMs: number): string | null {
  const dia = diaEnAR(iso);
  if (!dia) return null;
  if (anteriorIso !== null && diaEnAR(anteriorIso) === dia) return null;
  return etiquetaDiaChat(iso, ahoraMs) || null;
}

export type FilaConId = { id: string; created_at: string };

/**
 * Página del hilo a partir de filas pedidas de más nuevas a más viejas con `limite + 1`: devuelve las `limite`
 * más nuevas en orden cronológico y si hay más viejas para seguir subiendo.
 */
export function armarPagina<T extends FilaConId>(masNuevasPrimero: T[], limite: number): { mensajes: T[]; hayMas: boolean } {
  const hayMas = masNuevasPrimero.length > limite;
  return { mensajes: masNuevasPrimero.slice(0, limite).reverse(), hayMas };
}

/** true si el mensaje todavía está dentro de la ventana de 7 días. */
export function dentroDeVentana(iso: string, ahoraMs: number): boolean {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= ahoraMs - VENTANA_CHAT_MS;
}

/**
 * De varias sesiones, la "activa" para escribir: la CREADA más recientemente (desempate por id). Por creación y no por
 * actividad para que dos sesiones nacidas por pedidos simultáneos no se alternen según quién escribió último.
 */
export function elegirSesionActiva<T extends { id: string; created_at: string }>(sesiones: T[]): T | null {
  let mejor: T | null = null;
  for (const s of sesiones) {
    if (mejor === null || s.created_at > mejor.created_at || (s.created_at === mejor.created_at && s.id > mejor.id)) mejor = s;
  }
  return mejor;
}
