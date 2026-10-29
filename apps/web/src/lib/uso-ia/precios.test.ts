import { describe, expect, it } from "vitest";
import { costoMicroUSD, costoUSD, preciosDe } from "./precios";
import { LIMITE_MICRO_USD_DIARIO, LIMITE_USD_DIARIO, microDesdeTokensLegacy, microUsdDeFila, superaLimite } from "./limite";
import { calcularUso } from "./tipos";

const M = "claude-sonnet-5";

describe("costoMicroUSD / costoUSD", () => {
  it("cada componente por separado (precio por millón == micro-USD por token)", () => {
    expect(costoMicroUSD(M, { input: 1_000_000, output: 0 })).toBe(2_000_000);
    expect(costoMicroUSD(M, { input: 0, output: 1_000_000 })).toBe(10_000_000);
    expect(costoMicroUSD(M, { input: 0, output: 0, cacheRead: 1_000_000 })).toBe(200_000);
    expect(costoMicroUSD(M, { input: 0, output: 0, cacheWrite: 1_000_000 })).toBe(2_500_000);
  });
  it("suma los cuatro y convierte a dólares", () => {
    const uso = { input: 500, output: 200, cacheRead: 4000, cacheWrite: 3000 };
    expect(costoMicroUSD(M, uso)).toBe(1000 + 2000 + 800 + 7500);
    expect(costoUSD(M, uso)).toBeCloseTo(0.0113, 6);
  });
  it("redondea una sola vez a micro-USD enteros", () => {
    // 3 tokens de cache read = 0,6 micro-USD -> 1; 2 = 0,4 -> 0
    expect(costoMicroUSD(M, { input: 0, output: 0, cacheRead: 3 })).toBe(1);
    expect(costoMicroUSD(M, { input: 0, output: 0, cacheRead: 2 })).toBe(0);
    expect(Number.isInteger(costoMicroUSD(M, { input: 7, output: 3, cacheRead: 11, cacheWrite: 13 }))).toBe(true);
  });
  it("modelo desconocido usa el precio más caro conocido, nunca cero", () => {
    expect(preciosDe("modelo-que-no-existe")).toEqual(preciosDe(M));
    expect(costoMicroUSD("modelo-que-no-existe", { input: 1000, output: 1000 })).toBeGreaterThan(0);
  });
  it("ignora valores inválidos o negativos", () => {
    expect(costoMicroUSD(M, { input: -5, output: Number.NaN, cacheRead: undefined })).toBe(0);
  });
});

describe("límite diario en dólares", () => {
  it("US$0,33 = 330.000 micro-USD", () => {
    expect(LIMITE_USD_DIARIO).toBe(0.33);
    expect(LIMITE_MICRO_USD_DIARIO).toBe(330_000);
  });
  it("decide bajo / justo en / sobre el tope", () => {
    expect(superaLimite(329_999)).toBe(false);
    expect(superaLimite(330_000)).toBe(true);
    expect(superaLimite(400_000)).toBe(true);
    expect(calcularUso(329_999, LIMITE_MICRO_USD_DIARIO).agotado).toBe(false);
    expect(calcularUso(330_000, LIMITE_MICRO_USD_DIARIO)).toMatchObject({ agotado: true, restantes: 0, porcentajeUsado: 100 });
  });
  it("conversión del fallback viejo: 200.000 tokens ~ US$0,33", () => {
    expect(microDesdeTokensLegacy(200_000)).toBe(330_000);
    expect(microDesdeTokensLegacy(100_000)).toBe(165_000);
    expect(microDesdeTokensLegacy(0)).toBe(0);
    expect(microDesdeTokensLegacy(-1)).toBe(0);
  });
  it("microUsdDeFila usa costo si hay 036 y tokens si no", () => {
    const fila = { costo_micro_usd: 123, tokens_input: 100_000, tokens_output: 0 };
    expect(microUsdDeFila(fila, true)).toBe(123);
    expect(microUsdDeFila(fila, false)).toBe(165_000);
    expect(microUsdDeFila(null, true)).toBe(0);
  });
});
