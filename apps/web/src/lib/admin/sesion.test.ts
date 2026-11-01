import { describe, expect, it } from "vitest";
import {
  crearToken,
  INACTIVIDAD_MS,
  leerSecretoSesion,
  opcionesCookieAdmin,
  renovarSiVigente,
  renovarToken,
  verificarToken,
  VIDA_MAXIMA_MS,
} from "./sesion";

const S = "k".repeat(40);
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const ctx = (extra: Partial<{ secreto: string; userId: string; email: string; ahoraMs: number }> = {}) => ({
  secreto: S,
  userId: "u1",
  email: "ana@example.com",
  ahoraMs: T0,
  ...extra,
});

describe("leerSecretoSesion", () => {
  it("exige al menos 32 caracteres", () => {
    expect(leerSecretoSesion(undefined)).toBeNull();
    expect(leerSecretoSesion("corto")).toBeNull();
    expect(leerSecretoSesion("x".repeat(31))).toBeNull();
    expect(leerSecretoSesion(`  ${"x".repeat(32)}  `)).toBe("x".repeat(32));
  });
});

describe("token de verificación", () => {
  const token = crearToken({ userId: "u1", email: "Ana@Example.com", ahoraMs: T0, secreto: S });

  it("válido para el mismo usuario y email (sin importar mayúsculas)", () => {
    const r = verificarToken(token, ctx({ ahoraMs: T0 + 1000, email: "ANA@example.com" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toMatchObject({ u: "u1", e: "ana@example.com", i: T0, x: T0 + INACTIVIDAD_MS });
  });
  it("rechaza un token alterado", () => {
    const [cuerpo, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Record<string, unknown>;
    payload.x = T0 + 10 * VIDA_MAXIMA_MS;
    const falso = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(verificarToken(falso, ctx())).toEqual({ ok: false, motivo: "firma" });
  });
  it("rechaza un token firmado con otro secreto", () => {
    const ajeno = crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: T0, secreto: "z".repeat(40) });
    expect(verificarToken(ajeno, ctx())).toEqual({ ok: false, motivo: "firma" });
  });
  it("rechaza otro usuario o email", () => {
    expect(verificarToken(token, ctx({ userId: "u2" }))).toEqual({ ok: false, motivo: "usuario" });
    expect(verificarToken(token, ctx({ email: "bob@example.com" }))).toEqual({ ok: false, motivo: "usuario" });
  });
  it("vence a los 30 minutos sin actividad", () => {
    expect(verificarToken(token, ctx({ ahoraMs: T0 + INACTIVIDAD_MS - 1 })).ok).toBe(true);
    expect(verificarToken(token, ctx({ ahoraMs: T0 + INACTIVIDAD_MS }))).toEqual({ ok: false, motivo: "expirado" });
  });
  it("basura y vacío = formato", () => {
    for (const x of [undefined, null, "", "abc", "a.b.c", ".", "a."]) {
      expect(verificarToken(x, ctx()).ok).toBe(false);
    }
  });
});

describe("renovación deslizante", () => {
  const inicial = crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: T0, secreto: S });
  const payloadDe = (t: string) => {
    const r = verificarToken(t, ctx({ ahoraMs: T0 + 1 }));
    if (!r.ok) throw new Error("token inválido");
    return r.payload;
  };

  it("corre el vencimiento 30 minutos desde la actividad y conserva la emisión", () => {
    const t1 = T0 + 20 * 60_000;
    const renovado = renovarToken(payloadDe(inicial), t1, S);
    expect(renovado).not.toBeNull();
    const r = verificarToken(renovado, ctx({ ahoraMs: t1 + 29 * 60_000 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toMatchObject({ i: T0, x: t1 + INACTIVIDAD_MS });
    // el original ya habría vencido a esa hora
    expect(verificarToken(inicial, ctx({ ahoraMs: t1 + 29 * 60_000 })).ok).toBe(false);
  });
  it("no puede pasar del tope absoluto de vida", () => {
    const casi = T0 + VIDA_MAXIMA_MS - 5 * 60_000;
    const renovado = renovarToken(payloadDe(inicial), casi, S);
    const r = verificarToken(renovado, ctx({ ahoraMs: casi + 1 }));
    expect(r.ok && r.payload.x).toBe(T0 + VIDA_MAXIMA_MS);
    expect(renovarToken(payloadDe(inicial), T0 + VIDA_MAXIMA_MS, S)).toBeNull();
  });
  it("un token del tope se rechaza aunque no haya vencido por inactividad", () => {
    const renovado = renovarToken(payloadDe(inicial), T0 + VIDA_MAXIMA_MS - 1000, S) as string;
    expect(verificarToken(renovado, ctx({ ahoraMs: T0 + VIDA_MAXIMA_MS })).ok).toBe(false);
  });
});

describe("opciones de cookie", () => {
  it("httpOnly, SameSite=Lax, path /adminvita y Secure en producción", () => {
    expect(opcionesCookieAdmin(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/adminvita", maxAge: 1800 });
    expect(opcionesCookieAdmin(false).secure).toBe(false);
  });
});

describe("renovarSiVigente (lo que hace el proxy)", () => {
  const t = crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: T0, secreto: S });
  it("renueva una cookie vigente de esta sesión", () => {
    const nueva = renovarSiVigente(t, ctx({ ahoraMs: T0 + 10 * 60_000 }));
    expect(nueva).not.toBeNull();
    expect(verificarToken(nueva, ctx({ ahoraMs: T0 + 39 * 60_000 })).ok).toBe(true);
  });
  it("no resucita una vencida, ni renueva una de otro usuario o sin cookie", () => {
    expect(renovarSiVigente(t, ctx({ ahoraMs: T0 + INACTIVIDAD_MS }))).toBeNull();
    expect(renovarSiVigente(t, ctx({ userId: "u2" }))).toBeNull();
    expect(renovarSiVigente(undefined, ctx())).toBeNull();
  });
  it("el uso continuo mantiene viva la sesión hasta el tope", () => {
    let token: string | null = t;
    let ahora = T0;
    for (let i = 0; i < 20; i++) {
      ahora += 25 * 60_000;
      token = renovarSiVigente(token, ctx({ ahoraMs: ahora }));
      expect(token).not.toBeNull();
    }
    // 20 * 25 min = 500 min = 8,3 h: sigue viva. Superadas las 12 h ya no renueva.
    expect(renovarSiVigente(token, ctx({ ahoraMs: T0 + VIDA_MAXIMA_MS + 1 }))).toBeNull();
  });
});
