// Segundo factor del panel: código de 6 dígitos enviado al email de la sesión. Módulo puro (sin `server-only`).
// La verificación atómica (intentos, vencimiento, un solo uso) vive en la RPC `verificar_codigo_admin` (migración
// 046); acá están la generación, el hash, los límites de envío y los mensajes.

import { createHmac, randomInt } from "node:crypto";

export const OTP_DIGITOS = 6;
export const OTP_VENCE_MS = 10 * 60_000;
/** Espejo de la constante de la RPC `verificar_codigo_admin`. */
export const OTP_MAX_INTENTOS = 5;
export const ENVIO_MIN_ESPERA_MS = 60_000;
export const ENVIOS_MAX_POR_HORA = 5;

export function generarOtp(aleatorio: (maxExclusivo: number) => number = (n) => randomInt(n)): string {
  return String(aleatorio(10 ** OTP_DIGITOS)).padStart(OTP_DIGITOS, "0");
}

/** Deja solo los dígitos ("123 456" -> "123456"). */
export function normalizarOtp(crudo: string): string {
  return crudo.replace(/\D/g, "");
}

export function esOtpValido(normalizado: string): boolean {
  return /^\d{6}$/.test(normalizado);
}

/** HMAC con el secreto del servidor y el email del admin: el hash de un código no sirve para otro admin. */
export function hashOtp(codigo: string, email: string, secreto: string): string {
  return createHmac("sha256", secreto).update(`${email.trim().toLowerCase()}:${codigo}`, "utf8").digest("hex");
}

export type DecisionEnvio = { ok: true } | { ok: false; motivo: "minuto" | "hora"; esperarSeg: number };

/** Máx. 1 envío por minuto y 5 por hora, por admin. `enviosMs` = instantes de los envíos anteriores. */
export function evaluarEnvio(enviosMs: readonly number[], ahoraMs: number): DecisionEnvio {
  const ultimaHora = enviosMs.filter((t) => ahoraMs - t < 3_600_000).sort((a, b) => a - b);
  const ultimo = ultimaHora.length > 0 ? ultimaHora[ultimaHora.length - 1] : null;
  if (ultimo !== null && ahoraMs - ultimo < ENVIO_MIN_ESPERA_MS) {
    return { ok: false, motivo: "minuto", esperarSeg: Math.max(1, Math.ceil((ENVIO_MIN_ESPERA_MS - (ahoraMs - ultimo)) / 1000)) };
  }
  if (ultimaHora.length >= ENVIOS_MAX_POR_HORA) {
    return { ok: false, motivo: "hora", esperarSeg: Math.max(1, Math.ceil((3_600_000 - (ahoraMs - ultimaHora[0])) / 1000)) };
  }
  return { ok: true };
}

export type ResultadoVerificacion = "ok" | "incorrecto" | "agotado" | "vencido" | "sin_codigo";

export function esResultadoVerificacion(v: unknown): v is ResultadoVerificacion {
  return v === "ok" || v === "incorrecto" || v === "agotado" || v === "vencido" || v === "sin_codigo";
}

export function mensajeVerificacion(r: Exclude<ResultadoVerificacion, "ok">): string {
  switch (r) {
    case "incorrecto":
      return "Código incorrecto.";
    case "agotado":
      return "Demasiados intentos con ese código. Pedí uno nuevo.";
    case "vencido":
      return "El código venció. Pedí uno nuevo.";
    case "sin_codigo":
      return "Pedí un código primero.";
  }
}

export function mensajeEnvioLimitado(d: Extract<DecisionEnvio, { ok: false }>): string {
  return d.motivo === "minuto"
    ? `Esperá ${d.esperarSeg} segundos antes de pedir otro código.`
    : "Pediste demasiados códigos en la última hora. Probá más tarde.";
}
