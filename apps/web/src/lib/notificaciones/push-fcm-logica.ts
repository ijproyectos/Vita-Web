// Pure logic for the native (FCM HTTP v1) push channel. No I/O, no env: the
// sender in push-fcm.ts feeds it and acts on its decisions.

/** Subset of PayloadPush the native channel understands (actions are ignored). */
export type PayloadNativo = {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction?: boolean;
  renotify?: boolean;
  datos?: Record<string, string>;
};

export type MensajeFcm = {
  token: string;
  notification: { title: string; body: string };
  android: {
    priority: "HIGH";
    ttl: string;
    notification: { tag: string; channel_id: string };
  };
  data: Record<string, string>;
};

export const CANAL_ANDROID = "avisos";
export const RUTA_POR_DEFECTO = "/app";

const MAX_TITULO = 120;
const MAX_CUERPO = 600;
const MAX_TAG = 100;
const MAX_URL = 1024;
const MAX_CLAVE_DATO = 64;
const MAX_VALOR_DATO = 512;
const MAX_DATOS = 20;
/** FCM rejects messages over 4096 bytes; keep headroom for the envelope. */
const MAX_BYTES_DATA = 2048;
/** Same window as the Web Push TTL (4 h). */
const TTL_SEGUNDOS = 60 * 60 * 4;

export const LARGO_MIN_TOKEN = 20;
export const LARGO_MAX_TOKEN = 4096;

/** Keys FCM reserves for itself in the data map. */
function claveReservada(clave: string): boolean {
  return clave === "from" || clave === "message_type" || clave.startsWith("google.") || clave.startsWith("gcm.");
}

/** Only same-origin relative paths ("/x"), never "//host" or "/\host". */
export function esRutaRelativaSegura(url: unknown): url is string {
  return (
    typeof url === "string" &&
    url.length <= MAX_URL &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.startsWith("/\\") &&
    !/[\u0000-\u001f\u007f]/.test(url)
  );
}

/** A safe relative url, or the default screen. */
export function normalizarUrl(url: unknown): string {
  return esRutaRelativaSegura(url) ? url : RUTA_POR_DEFECTO;
}

function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`;
}

function bytes(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

/** Builds the string-only data map: url and tag first, then `datos` while it fits. */
export function armarData(payload: Pick<PayloadNativo, "url" | "tag" | "datos">): Record<string, string> {
  const data: Record<string, string> = {
    url: normalizarUrl(payload.url),
    tag: recortar(String(payload.tag ?? ""), MAX_TAG),
  };
  let usado = bytes(data.url) + bytes(data.tag);
  let n = 0;
  for (const [clave, valor] of Object.entries(payload.datos ?? {})) {
    if (n >= MAX_DATOS) break;
    if (clave === "url" || clave === "tag") continue;
    if (!clave || clave.length > MAX_CLAVE_DATO || claveReservada(clave)) continue;
    if (typeof valor !== "string") continue;
    const v = recortar(valor, MAX_VALOR_DATO);
    const costo = bytes(clave) + bytes(v);
    if (usado + costo > MAX_BYTES_DATA) continue;
    data[clave] = v;
    usado += costo;
    n++;
  }
  return data;
}

/** Maps a PayloadPush to the FCM v1 `message` body for one device token. */
export function armarMensajeFcm(token: string, payload: PayloadNativo): MensajeFcm {
  return {
    token,
    notification: {
      title: recortar(payload.title, MAX_TITULO),
      body: recortar(payload.body, MAX_CUERPO),
    },
    android: {
      // Reminders must wake the device: always high priority.
      priority: "HIGH",
      ttl: `${TTL_SEGUNDOS}s`,
      notification: { tag: recortar(payload.tag, MAX_TAG), channel_id: CANAL_ANDROID },
    },
    data: armarData(payload),
  };
}

export type ErrorFcm = { status?: number; cuerpo?: unknown };
export type ClasificacionFcm = "token-muerto" | "fallido";

type DetalleFcm = { errorCode?: unknown; fieldViolations?: { field?: unknown }[] };
type CuerpoFcm = { error?: { status?: unknown; message?: unknown; details?: DetalleFcm[] } };

/**
 * UNREGISTERED / 404 mean the token is gone; INVALID_ARGUMENT only when it is
 * about the token itself (a bad payload must not delete a healthy token).
 * Anything else (quota, auth, 5xx, network) is a plain failure.
 */
export function clasificarErrorFcm({ status, cuerpo }: ErrorFcm): ClasificacionFcm {
  if (status === 404) return "token-muerto";
  const error = (cuerpo as CuerpoFcm | null | undefined)?.error;
  const detalles = Array.isArray(error?.details) ? error.details : [];
  if (detalles.some((d) => d?.errorCode === "UNREGISTERED")) return "token-muerto";
  if (error?.status === "NOT_FOUND" || error?.status === "UNREGISTERED") return "token-muerto";
  if (error?.status === "INVALID_ARGUMENT") {
    const habla = (campo: unknown) => typeof campo === "string" && /token/i.test(campo);
    const campoToken = detalles.some((d) => Array.isArray(d?.fieldViolations) && d.fieldViolations.some((f) => habla(f?.field)));
    if (campoToken || habla(error.message)) return "token-muerto";
  }
  return "fallido";
}

/** Shape check for a token coming from the client (FCM tokens are url-safe-ish). */
export function esTokenNativoValido(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= LARGO_MIN_TOKEN &&
    token.length <= LARGO_MAX_TOKEN &&
    /^[A-Za-z0-9_:.\-]+$/.test(token)
  );
}
