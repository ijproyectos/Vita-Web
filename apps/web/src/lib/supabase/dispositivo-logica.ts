import { createHash, timingSafeEqual } from "node:crypto";

/** Minimum length of the shared device token. */
export const TOKEN_DISPOSITIVO_MIN = 32;
/** Renew the cached access token this long before it expires. */
export const MARGEN_RENOVACION_SEG = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/**
 * Returns the configured user id when `Authorization` carries the configured device
 * token (constant-time compare of equal-length digests); null otherwise (browser path).
 */
export function usuarioDeDispositivo(
  authorization: string | null | undefined,
  env: { DISPOSITIVO_TOKEN?: string; DISPOSITIVO_USUARIO_ID?: string },
): string | null {
  const token = env.DISPOSITIVO_TOKEN;
  const usuario = env.DISPOSITIVO_USUARIO_ID;
  if (!token || token.length < TOKEN_DISPOSITIVO_MIN) return null;
  if (!usuario || !UUID.test(usuario)) return null;
  const m = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!m) return null;
  return timingSafeEqual(sha256(m[1]), sha256(token)) ? usuario : null;
}

/** Is a cached access token (expires_at in epoch seconds) still usable at `ahoraSeg`? */
export function tokenVigente(expiraSeg: number | null | undefined, ahoraSeg: number): boolean {
  return typeof expiraSeg === "number" && expiraSeg - MARGEN_RENOVACION_SEG > ahoraSeg;
}
