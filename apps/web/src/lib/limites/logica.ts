// Lógica pura del límite de pedidos (tabla limites_pedidos, migración 034): ventanas, topes y claves.
// Sin I/O ni `server-only`, para poder testearla cuando haya runner.

export type VentanaLimite = "min" | "dia";

export type Limite = {
  /** Prefijo de la clave: qué endpoint se cuenta. */
  endpoint: "chat" | "voz";
  /** A quién se cuenta. */
  sujeto: "u" | "ip";
  ventana: VentanaLimite;
  maximo: number;
};

/** Topes por defecto (constantes en código, como LIMITE_TOKENS_DIARIO; no son env vars). */
export const LIMITES_CHAT: Limite[] = [
  { endpoint: "chat", sujeto: "u", ventana: "min", maximo: 15 },
  { endpoint: "chat", sujeto: "ip", ventana: "min", maximo: 60 },
  { endpoint: "chat", sujeto: "u", ventana: "dia", maximo: 300 },
];
export const LIMITES_VOZ: Limite[] = [{ endpoint: "voz", sujeto: "u", ventana: "min", maximo: 30 }];

export const MENSAJE_LIMITE_PEDIDOS = "Mandaste muchos mensajes seguidos, esperá un minuto.";
export const MENSAJE_LIMITE_PEDIDOS_DIA = "Llegaste al máximo de mensajes por hoy. Probá de nuevo mañana.";

const MS_MINUTO = 60_000;
const MS_DIA = 86_400_000;
// Argentina no tiene horario de verano: UTC-3 fijo (mismo criterio que fechaISOEnAR en lib/rutina).
const OFFSET_AR_MS = 3 * 3_600_000;

/** Comienzo de la ventana fija que contiene `ahoraMs` (minuto UTC, o día calendario de Argentina). */
export function inicioVentana(ahoraMs: number, ventana: VentanaLimite): Date {
  if (ventana === "min") return new Date(Math.floor(ahoraMs / MS_MINUTO) * MS_MINUTO);
  return new Date(Math.floor((ahoraMs - OFFSET_AR_MS) / MS_DIA) * MS_DIA + OFFSET_AR_MS);
}

/** Segundos hasta que termina la ventana (para Retry-After), mínimo 1. */
export function segundosHastaFinDeVentana(ahoraMs: number, ventana: VentanaLimite): number {
  const fin = inicioVentana(ahoraMs, ventana).getTime() + (ventana === "min" ? MS_MINUTO : MS_DIA);
  return Math.max(1, Math.ceil((fin - ahoraMs) / 1000));
}

/** Clave de la fila; `sujetoId` es el id del usuario o el HMAC de la IP (nunca la IP cruda). */
export function claveLimite(l: Limite, sujetoId: string): string {
  return `${l.endpoint}:${l.sujeto}:${sujetoId}:${l.ventana}`;
}

/** Se supera el tope cuando la cuenta (ya incluido este pedido) pasa del máximo. */
export function superaLimite(cuenta: number, maximo: number): boolean {
  return cuenta > maximo;
}

/** IP del cliente desde los headers del request (Netlify primero), o null si no se puede saber. */
export function ipDeHeaders(headers: Headers): string | null {
  return headers.get("x-nf-client-connection-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
