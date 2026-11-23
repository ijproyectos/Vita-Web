// Pure logic for the native Google/Apple login (Capacitor shell). No Capacitor,
// no Supabase, no DOM: everything here is unit-testable. The side-effectful
// orchestration lives in `login-nativo.ts`.

export type Plataforma = "android" | "ios";
export type Proveedor = "google" | "apple";
/** How a provider button signs in: browser OAuth redirect (plain web) or the native sheet. */
export type Via = "redirect" | "nativo";
export type ProveedorDisponible = { proveedor: Proveedor; via: Via };

export type MotivoFallo = "cancelado" | "no-disponible" | "error";

/**
 * Which providers to offer. Plain web keeps Google through the existing OAuth
 * redirect; Apple is only ever offered on iOS (guideline 4.8 applies there and
 * the native sheet does not exist elsewhere).
 */
export function proveedoresDisponibles(plataforma: Plataforma | null): ProveedorDisponible[] {
  if (plataforma === "ios") {
    return [
      { proveedor: "google", via: "nativo" },
      { proveedor: "apple", via: "nativo" },
    ];
  }
  if (plataforma === "android") return [{ proveedor: "google", via: "nativo" }];
  return [{ proveedor: "google", via: "redirect" }];
}

export type IdsCliente = { web?: string; ios?: string };

function limpio(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export type ConfigGoogle = { webClientId?: string; iOSClientId?: string };

/**
 * Google client ids needed on each platform. Android uses the web client id
 * (Credential Manager); iOS needs its own iOS client id (the web id is passed
 * along when present so the token audience matches what Supabase authorizes).
 * Returns null when the id required on that platform is missing.
 */
export function configGoogle(plataforma: Plataforma, ids: IdsCliente): ConfigGoogle | null {
  const web = limpio(ids.web);
  const ios = limpio(ids.ios);
  if (plataforma === "android") return web ? { webClientId: web } : null;
  if (!ios) return null;
  return web ? { iOSClientId: ios, webClientId: web } : { iOSClientId: ios };
}

// ───────────────────────────── Nonce ─────────────────────────────

type CryptoGetRandom = { getRandomValues<T extends ArrayBufferView | null>(array: T): T };
type CryptoDigest = { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> };

function aBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe random nonce (32 bytes of entropy). */
export function generarNonce(crypto: CryptoGetRandom, bytes = 32): string {
  return aBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Lowercase hex of SHA-256(raw): what Google embeds in the ID token `nonce` claim. */
export async function digestNonce(raw: string, subtle: CryptoDigest): Promise<string> {
  const hash = await subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Payload of a JWT (no signature check: Supabase verifies it), or null if malformed. */
export function leerClaimsJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length < 2 || !partes[1]) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * True when the ID token carries a `nonce` claim. Only then Supabase must
 * receive the raw nonce; sending one for a token without the claim is rejected.
 */
export function tokenTraeNonce(token: string): boolean {
  const nonce = leerClaimsJwt(token)?.nonce;
  return typeof nonce === "string" && nonce.length > 0;
}

// ───────────────────────────── Errors ─────────────────────────────

type ErrorLike = { code?: unknown; message?: unknown; status?: unknown };

function texto(e: unknown): { code: string; msg: string; status: number | null } {
  if (typeof e === "string") return { code: "", msg: e.toLowerCase(), status: null };
  const o: ErrorLike = e && typeof e === "object" ? (e as ErrorLike) : {};
  return {
    code: typeof o.code === "string" || typeof o.code === "number" ? String(o.code).toLowerCase() : "",
    msg: typeof o.message === "string" ? o.message.toLowerCase() : "",
    status: typeof o.status === "number" ? o.status : null,
  };
}

// Cancellation shows up differently per platform/provider: Android Credential
// Manager ("User canceled"), Google iOS (-5 / "canceled"), Apple
// (ASAuthorizationError.canceled = 1001, "dismissed"), Google Play (12501).
const PATRON_CANCELADO = /cancel|dismiss|closed by user|user_cancel|aborted by user/;
const CODIGOS_CANCELADO = new Set(["1001", "12501", "-5", "user_cancelled", "user_canceled", "canceled", "cancelled"]);

export function esCancelacion(e: unknown): boolean {
  const { code, msg } = texto(e);
  return CODIGOS_CANCELADO.has(code) || PATRON_CANCELADO.test(code) || PATRON_CANCELADO.test(msg);
}

export type FalloNativo = { ok: false; motivo: MotivoFallo; mensaje: string };

export function mensajeNoDisponible(proveedor: Proveedor): string {
  return proveedor === "apple"
    ? "Continuar con Apple no está disponible en este dispositivo."
    : "Continuar con Google no está disponible en este momento.";
}

/** Plugin or Supabase error → discriminated failure with a friendly es-AR message. Never includes tokens. */
export function clasificarError(e: unknown, proveedor: Proveedor): FalloNativo {
  if (esCancelacion(e)) return { ok: false, motivo: "cancelado", mensaje: "" };
  const { code, msg, status } = texto(e);
  const nombre = proveedor === "apple" ? "Apple" : "Google";
  if (code.includes("rate_limit") || status === 429)
    return { ok: false, motivo: "error", mensaje: "Hicimos muchos intentos seguidos. Esperá unos minutos y probá de nuevo." };
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline") || msg.includes("internet"))
    return { ok: false, motivo: "error", mensaje: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo." };
  if (code === "provider_disabled" || msg.includes("provider is not enabled") || msg.includes("unsupported provider"))
    return { ok: false, motivo: "no-disponible", mensaje: mensajeNoDisponible(proveedor) };
  if (msg.includes("not implemented") || msg.includes("unimplemented") || msg.includes("not available"))
    return { ok: false, motivo: "no-disponible", mensaje: mensajeNoDisponible(proveedor) };
  return { ok: false, motivo: "error", mensaje: `No se pudo iniciar sesión con ${nombre}. Intentá de nuevo.` };
}

/** "Given Family" from Apple's first-login profile, or null when Apple sent no name. */
export function nombreCompleto(perfil: { givenName?: string | null; familyName?: string | null } | null | undefined): string | null {
  const partes = [perfil?.givenName, perfil?.familyName].map((p) => p?.trim()).filter((p): p is string => !!p);
  return partes.length ? partes.join(" ") : null;
}
