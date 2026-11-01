import { describe, expect, it } from "vitest";
import {
  ENVIOS_MAX_POR_HORA,
  esOtpValido,
  esResultadoVerificacion,
  evaluarEnvio,
  generarOtp,
  hashOtp,
  mensajeEnvioLimitado,
  mensajeVerificacion,
  normalizarOtp,
  OTP_MAX_INTENTOS,
  OTP_VENCE_MS,
} from "./otp";

describe("generación y normalización", () => {
  it("siempre 6 dígitos, con ceros a la izquierda", () => {
    expect(generarOtp(() => 7)).toBe("000007");
    expect(generarOtp(() => 999_999)).toBe("999999");
    for (let i = 0; i < 200; i++) expect(generarOtp()).toMatch(/^\d{6}$/);
  });
  it("normaliza y valida", () => {
    expect(normalizarOtp(" 123 456\n")).toBe("123456");
    expect(esOtpValido("123456")).toBe(true);
    expect(esOtpValido("12345")).toBe(false);
    expect(esOtpValido("1234567")).toBe(false);
    expect(esOtpValido("12345a")).toBe(false);
  });
  it("constantes pedidas: 10 minutos y 5 intentos", () => {
    expect(OTP_VENCE_MS).toBe(600_000);
    expect(OTP_MAX_INTENTOS).toBe(5);
  });
});

describe("hashOtp", () => {
  it("determinista, hex de 64 y atado al email y al secreto", () => {
    const h = hashOtp("123456", "ana@example.com", "s".repeat(40));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp("123456", "ANA@example.com", "s".repeat(40))).toBe(h);
    expect(hashOtp("123456", "bob@example.com", "s".repeat(40))).not.toBe(h);
    expect(hashOtp("123456", "ana@example.com", "t".repeat(40))).not.toBe(h);
    expect(hashOtp("123457", "ana@example.com", "s".repeat(40))).not.toBe(h);
  });
});

describe("límite de envíos (1 por minuto, 5 por hora)", () => {
  const ahora = Date.UTC(2026, 10, 1, 12, 0, 0);
  it("el primero pasa", () => {
    expect(evaluarEnvio([], ahora)).toEqual({ ok: true });
  });
  it("uno hace menos de un minuto frena y dice cuánto esperar", () => {
    const r = evaluarEnvio([ahora - 20_000], ahora);
    expect(r).toEqual({ ok: false, motivo: "minuto", esperarSeg: 40 });
    expect(mensajeEnvioLimitado(r as Extract<typeof r, { ok: false }>)).toContain("40 segundos");
  });
  it("pasado el minuto vuelve a pasar", () => {
    expect(evaluarEnvio([ahora - 60_000], ahora)).toEqual({ ok: true });
  });
  it("el sexto en una hora se frena aunque espacien un minuto", () => {
    const cinco = Array.from({ length: ENVIOS_MAX_POR_HORA }, (_, i) => ahora - (i + 1) * 5 * 60_000);
    const r = evaluarEnvio(cinco, ahora);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("hora");
  });
  it("los de hace más de una hora no cuentan", () => {
    const viejos = Array.from({ length: 10 }, (_, i) => ahora - 3_600_000 - i * 1000);
    expect(evaluarEnvio(viejos, ahora)).toEqual({ ok: true });
  });
});

describe("resultados de la verificación", () => {
  it("reconoce solo los de la RPC y mapea mensajes", () => {
    for (const r of ["ok", "incorrecto", "agotado", "vencido", "sin_codigo"]) expect(esResultadoVerificacion(r)).toBe(true);
    expect(esResultadoVerificacion("otro")).toBe(false);
    expect(esResultadoVerificacion(null)).toBe(false);
    expect(mensajeVerificacion("agotado")).toMatch(/nuevo/);
    expect(mensajeVerificacion("incorrecto")).toBe("Código incorrecto.");
  });
});
