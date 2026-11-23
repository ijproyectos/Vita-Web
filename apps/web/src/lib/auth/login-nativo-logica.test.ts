import { describe, expect, it } from "vitest";
import {
  clasificarError,
  configGoogle,
  digestNonce,
  esCancelacion,
  generarNonce,
  leerClaimsJwt,
  nombreCompleto,
  proveedoresDisponibles,
  tokenTraeNonce,
} from "./login-nativo-logica";

function jwt(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.firma`;
}

describe("proveedoresDisponibles", () => {
  it("plain web: Google through the OAuth redirect only", () => {
    expect(proveedoresDisponibles(null)).toEqual([{ proveedor: "google", via: "redirect" }]);
  });
  it("android: native Google, never Apple", () => {
    const p = proveedoresDisponibles("android");
    expect(p).toEqual([{ proveedor: "google", via: "nativo" }]);
    expect(p.some((x) => x.proveedor === "apple")).toBe(false);
  });
  it("ios: native Google + native Apple", () => {
    expect(proveedoresDisponibles("ios")).toEqual([
      { proveedor: "google", via: "nativo" },
      { proveedor: "apple", via: "nativo" },
    ]);
  });
});

describe("configGoogle", () => {
  it("android needs the web client id", () => {
    expect(configGoogle("android", { web: "web-id" })).toEqual({ webClientId: "web-id" });
    expect(configGoogle("android", { ios: "ios-id" })).toBeNull();
    expect(configGoogle("android", { web: "  " })).toBeNull();
  });
  it("ios needs the iOS client id (web id optional)", () => {
    expect(configGoogle("ios", { ios: "ios-id" })).toEqual({ iOSClientId: "ios-id" });
    expect(configGoogle("ios", { ios: "ios-id", web: "web-id" })).toEqual({ iOSClientId: "ios-id", webClientId: "web-id" });
    expect(configGoogle("ios", { web: "web-id" })).toBeNull();
    expect(configGoogle("ios", {})).toBeNull();
  });
});

describe("nonce", () => {
  it("digest matches the known SHA-256 vectors (lowercase hex)", async () => {
    expect(await digestNonce("abc", globalThis.crypto.subtle)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(await digestNonce("", globalThis.crypto.subtle)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
  it("generates URL-safe, unique, long-enough nonces", () => {
    const a = generarNonce(globalThis.crypto);
    const b = generarNonce(globalThis.crypto);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it("uses the injected crypto", () => {
    const falso = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => ((a as unknown as Uint8Array).fill(255), a) };
    expect(generarNonce(falso, 3)).toBe("____");
  });
});

describe("JWT nonce claim", () => {
  it("detects a present nonce", () => {
    expect(tokenTraeNonce(jwt({ nonce: "abc", sub: "1" }))).toBe(true);
  });
  it.each([{ sub: "1" }, { nonce: "" }, { nonce: 5 }, { nonce: null }])("is false for %j", (p) => {
    expect(tokenTraeNonce(jwt(p))).toBe(false);
  });
  it("is false for malformed tokens", () => {
    for (const t of ["", "abc", "a.b", "a.!!!.c", `a.${Buffer.from("[1]").toString("base64url")}.c`]) {
      expect(tokenTraeNonce(t)).toBe(false);
    }
    expect(leerClaimsJwt("a.b")).toBeNull();
  });
  it("decodes UTF-8 payloads", () => {
    expect(leerClaimsJwt(jwt({ name: "José Peña" }))).toEqual({ name: "José Peña" });
  });
});

describe("error mapping", () => {
  it.each([
    new Error("User canceled the sign-in flow"),
    { code: "12501", message: "" },
    { code: 1001, message: "The operation couldn't be completed" },
    { message: "Sign in dismissed" },
    "cancelled",
  ])("cancellation %j is silent", (e) => {
    expect(esCancelacion(e)).toBe(true);
    expect(clasificarError(e, "google")).toEqual({ ok: false, motivo: "cancelado", mensaje: "" });
  });
  it("real errors get a friendly message, never the raw one", () => {
    const r = clasificarError(new Error("SOMETHING eyJhbGciOi token leaked"), "apple");
    expect(r).toEqual({ ok: false, motivo: "error", mensaje: "No se pudo iniciar sesión con Apple. Intentá de nuevo." });
  });
  it("maps rate limit, network and disabled provider", () => {
    expect(clasificarError({ status: 429 }, "google").mensaje).toMatch(/muchos intentos/);
    expect(clasificarError(new Error("Network request failed"), "google").mensaje).toMatch(/conexión/);
    expect(clasificarError({ code: "provider_disabled" }, "apple").motivo).toBe("no-disponible");
  });
  it("tolerates non-error values", () => {
    expect(clasificarError(undefined, "google").motivo).toBe("error");
    expect(clasificarError(42, "google").motivo).toBe("error");
  });
});

describe("nombreCompleto", () => {
  it("joins given and family names", () => {
    expect(nombreCompleto({ givenName: "Ana", familyName: "Pérez" })).toBe("Ana Pérez");
    expect(nombreCompleto({ givenName: " Ana ", familyName: null })).toBe("Ana");
  });
  it("is null when Apple sent no name (not the first login)", () => {
    expect(nombreCompleto({ givenName: null, familyName: null })).toBeNull();
    expect(nombreCompleto(null)).toBeNull();
    expect(nombreCompleto(undefined)).toBeNull();
  });
});
