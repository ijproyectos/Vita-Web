import { describe, expect, it } from "vitest";
import { calcularUso, sumarUso, tokensEntradaPonderados, tokensPonderados, usoDeAnthropic } from "./tipos";

describe("calcularUso", () => {
  it("uso parcial", () => {
    expect(calcularUso(3, 10)).toEqual({ usados: 3, limite: 10, restantes: 7, porcentajeUsado: 30, agotado: false });
  });
  it("justo en el límite está agotado", () => {
    const r = calcularUso(10, 10);
    expect(r.agotado).toBe(true);
    expect(r.restantes).toBe(0);
    expect(r.porcentajeUsado).toBe(100);
  });
  it("pasarse del límite no da negativos ni más de 100%", () => {
    const r = calcularUso(15, 10);
    expect(r.restantes).toBe(0);
    expect(r.porcentajeUsado).toBe(100);
    expect(r.agotado).toBe(true);
  });
  it("cero usado", () => {
    expect(calcularUso(0, 10)).toMatchObject({ restantes: 10, porcentajeUsado: 0, agotado: false });
  });
  it("redondea el porcentaje", () => {
    expect(calcularUso(1, 3).porcentajeUsado).toBe(33);
    expect(calcularUso(2, 3).porcentajeUsado).toBe(67);
  });
  it("límite 0 cuenta como agotado", () => {
    expect(calcularUso(0, 0).agotado).toBe(true);
  });
  // Bug conocido: 0/0 deja el porcentaje en NaN (Math.min/max lo propagan). Pasarlo a it al arreglarlo.
  it.fails("límite 0 da un porcentaje numérico", () => {
    expect(Number.isFinite(calcularUso(0, 0).porcentajeUsado)).toBe(true);
  });
});

describe("tokens ponderados por costo", () => {
  it("sin caché es input + output", () => {
    expect(tokensPonderados({ inputTokens: 100, outputTokens: 50 })).toBe(150);
  });
  it("escritura x1.25 y lectura x0.1, redondeadas", () => {
    const uso = { inputTokens: 10, outputTokens: 20, cacheCreationTokens: 1000, cacheReadTokens: 5000 };
    expect(tokensEntradaPonderados(uso)).toBe(10 + 1250 + 500);
    expect(tokensPonderados(uso)).toBe(10 + 1250 + 500 + 20);
    expect(tokensEntradaPonderados({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 3, cacheReadTokens: 7 })).toBe(4 + 1);
  });
  it("una lectura de caché cuesta mucho menos que input nuevo", () => {
    expect(tokensPonderados({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 10_000 })).toBe(1000);
  });
  it("usoDeAnthropic tolera null, NaN y negativos", () => {
    expect(usoDeAnthropic(null)).toEqual({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
    expect(usoDeAnthropic({ input_tokens: -1, output_tokens: Number.NaN, cache_read_input_tokens: null, cache_creation_input_tokens: 5 })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 5,
      cacheReadTokens: 0,
    });
  });
  it("sumarUso acumula todos los campos", () => {
    const a = { inputTokens: 1, outputTokens: 2, cacheCreationTokens: 3, cacheReadTokens: 4 };
    expect(sumarUso(a, { inputTokens: 10, outputTokens: 20 })).toEqual({ inputTokens: 11, outputTokens: 22, cacheCreationTokens: 3, cacheReadTokens: 4 });
  });
});
