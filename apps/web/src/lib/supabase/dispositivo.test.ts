import { describe, expect, it } from "vitest";
import { MARGEN_RENOVACION_SEG, motivoRechazoDispositivo, tokenVigente, usuarioDeDispositivo } from "./dispositivo-logica";

const TOKEN = "a".repeat(40);
const ID = "11111111-2222-3333-4444-555555555555";
const env = { DISPOSITIVO_TOKEN: TOKEN, DISPOSITIVO_USUARIO_ID: ID };

describe("usuarioDeDispositivo", () => {
  it("matches the right bearer token", () => expect(usuarioDeDispositivo(`Bearer ${TOKEN}`, env)).toBe(ID));
  it("rejects a wrong token", () => expect(usuarioDeDispositivo(`Bearer ${"b".repeat(40)}`, env)).toBeNull());
  it("rejects a prefix of the token", () => expect(usuarioDeDispositivo(`Bearer ${TOKEN.slice(0, 39)}`, env)).toBeNull());
  it("rejects missing or non-bearer header", () => {
    expect(usuarioDeDispositivo(null, env)).toBeNull();
    expect(usuarioDeDispositivo(`Basic ${TOKEN}`, env)).toBeNull();
  });
  it("falls back when env is missing, short or invalid", () => {
    expect(usuarioDeDispositivo(`Bearer ${TOKEN}`, {})).toBeNull();
    expect(usuarioDeDispositivo("Bearer short", { ...env, DISPOSITIVO_TOKEN: "short" })).toBeNull();
    expect(usuarioDeDispositivo(`Bearer ${TOKEN}`, { ...env, DISPOSITIVO_USUARIO_ID: "nope" })).toBeNull();
  });
});

describe("motivoRechazoDispositivo", () => {
  it("is null for browsers (no bearer header)", () => expect(motivoRechazoDispositivo(null, env)).toBeNull());
  it("is null when the device is accepted", () => expect(motivoRechazoDispositivo(`Bearer ${TOKEN}`, env)).toBeNull());
  it("reports missing or short token env", () => {
    expect(motivoRechazoDispositivo(`Bearer ${TOKEN}`, {})).toBe("token_env_ausente_o_corto");
    expect(motivoRechazoDispositivo(`Bearer ${TOKEN}`, { ...env, DISPOSITIVO_TOKEN: "short" })).toBe("token_env_ausente_o_corto");
  });
  it("reports missing or invalid user id env", () => {
    expect(motivoRechazoDispositivo(`Bearer ${TOKEN}`, { ...env, DISPOSITIVO_USUARIO_ID: "nope" })).toBe("usuario_env_ausente_o_invalido");
  });
  it("reports a different token", () => expect(motivoRechazoDispositivo(`Bearer ${"b".repeat(40)}`, env)).toBe("token_distinto"));
});

describe("tokenVigente", () => {
  it("is valid well before expiry", () => expect(tokenVigente(1000 + MARGEN_RENOVACION_SEG + 1, 1000)).toBe(true));
  it("renews inside the margin", () => expect(tokenVigente(1000 + MARGEN_RENOVACION_SEG, 1000)).toBe(false));
  it("is invalid when absent or expired", () => {
    expect(tokenVigente(null, 1000)).toBe(false);
    expect(tokenVigente(500, 1000)).toBe(false);
  });
});
