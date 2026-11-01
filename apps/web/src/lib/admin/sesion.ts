// Cookie de verificación del panel /adminvita (segundo factor ya cumplido). Módulo puro: sin `server-only` ni Next,
// para poder usarlo desde el proxy y testearlo.
//
// Formato: base64url(JSON {u: id de usuario, e: email, i: emitida, x: vence}) + "." + base64url(HMAC-SHA256).
// La cookie está atada al usuario y al email de la sesión de Supabase: una cookie ajena o de otra cuenta no sirve.
// Es DESLIZANTE: cada vista del panel la renueva (ver `renovarToken` y el proxy), con tope de vida absoluto.

import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_ADMIN = "vita_admin_2fa";
export const RUTA_COOKIE_ADMIN = "/adminvita";
/** Sin actividad (ninguna vista del panel) por este tiempo, hay que volver a verificar. */
export const INACTIVIDAD_MS = 30 * 60_000;
/** Tope absoluto desde que se verificó, aunque haya actividad continua. */
export const VIDA_MAXIMA_MS = 12 * 3_600_000;
const SECRETO_MIN = 32;

export type PayloadSesion = { u: string; e: string; i: number; x: number };

/** El secreto tiene que existir y ser largo; si no, nadie puede completar la verificación. */
export function leerSecretoSesion(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  return v && v.length >= SECRETO_MIN ? v : null;
}

const b64 = (buf: Buffer) => buf.toString("base64url");

function firma(cuerpo: string, secreto: string): Buffer {
  return createHmac("sha256", secreto).update(cuerpo, "utf8").digest();
}

function emitir(payload: PayloadSesion, secreto: string): string {
  const cuerpo = b64(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${cuerpo}.${b64(firma(cuerpo, secreto))}`;
}

export function crearToken(args: { userId: string; email: string; ahoraMs: number; secreto: string }): string {
  const { userId, email, ahoraMs, secreto } = args;
  return emitir({ u: userId, e: email.trim().toLowerCase(), i: ahoraMs, x: ahoraMs + INACTIVIDAD_MS }, secreto);
}

export type MotivoToken = "formato" | "firma" | "usuario" | "expirado" | "vida_maxima";

export type ResultadoToken = { ok: true; payload: PayloadSesion } | { ok: false; motivo: MotivoToken };

function leerPayload(texto: string): PayloadSesion | null {
  try {
    const o: unknown = JSON.parse(texto);
    if (typeof o !== "object" || o === null) return null;
    const r = o as Record<string, unknown>;
    if (typeof r.u !== "string" || typeof r.e !== "string" || typeof r.i !== "number" || typeof r.x !== "number") return null;
    if (!Number.isFinite(r.i) || !Number.isFinite(r.x)) return null;
    return { u: r.u, e: r.e, i: r.i, x: r.x };
  } catch {
    return null;
  }
}

export function verificarToken(
  token: string | null | undefined,
  ctx: { secreto: string; userId: string; email: string; ahoraMs: number },
): ResultadoToken {
  if (!token) return { ok: false, motivo: "formato" };
  const partes = token.split(".");
  if (partes.length !== 2 || partes[0] === "" || partes[1] === "") return { ok: false, motivo: "formato" };
  const [cuerpo, sig] = partes;

  const esperada = firma(cuerpo, ctx.secreto);
  let recibida: Buffer;
  try {
    recibida = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return { ok: false, motivo: "firma" };

  let texto: string;
  try {
    texto = Buffer.from(cuerpo, "base64url").toString("utf8");
  } catch {
    return { ok: false, motivo: "formato" };
  }
  const payload = leerPayload(texto);
  if (!payload) return { ok: false, motivo: "formato" };

  if (payload.u !== ctx.userId || payload.e !== ctx.email.trim().toLowerCase()) return { ok: false, motivo: "usuario" };
  if (payload.x <= ctx.ahoraMs) return { ok: false, motivo: "expirado" };
  if (ctx.ahoraMs - payload.i >= VIDA_MAXIMA_MS) return { ok: false, motivo: "vida_maxima" };
  return { ok: true, payload };
}

/**
 * Cookie renovada: mismo usuario y misma emisión, nuevo vencimiento a `INACTIVIDAD_MS` desde ahora (sin pasar del
 * tope absoluto). Devuelve null si ya no se puede renovar.
 */
export function renovarToken(payload: PayloadSesion, ahoraMs: number, secreto: string): string | null {
  const tope = payload.i + VIDA_MAXIMA_MS;
  if (ahoraMs >= tope) return null;
  return emitir({ ...payload, x: Math.min(ahoraMs + INACTIVIDAD_MS, tope) }, secreto);
}

export function opcionesCookieAdmin(produccion: boolean) {
  return {
    httpOnly: true,
    secure: produccion,
    sameSite: "lax" as const,
    path: RUTA_COOKIE_ADMIN,
    maxAge: Math.floor(INACTIVIDAD_MS / 1000),
  };
}

/**
 * Lo que hace el proxy en cada vista del panel: si la cookie es válida para ESTA sesión, devuelve la renovada
 * (vencimiento corrido 30 minutos); si no hay cookie, está vencida, manipulada o es de otro usuario, null (no se
 * crea ni se resucita nada: la verificación solo se obtiene con el código).
 */
export function renovarSiVigente(
  token: string | null | undefined,
  ctx: { secreto: string; userId: string; email: string; ahoraMs: number },
): string | null {
  const r = verificarToken(token, ctx);
  return r.ok ? renovarToken(r.payload, ctx.ahoraMs, ctx.secreto) : null;
}
