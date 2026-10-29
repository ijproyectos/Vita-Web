import { describe, expect, it } from "vitest";
import {
  alcanzaParaOtraVuelta,
  HOLGURA_TIMEOUT_SDK_MS,
  MARGEN_CIERRE_MS,
  minimoParaOtraVueltaMs,
  msHastaElCorte,
  PRESUPUESTO_RESPUESTA_MS,
  restanteMs,
  textoCortePorTiempo,
  timeoutSdkMs,
  TIMEOUT_PROVEEDOR_VOZ_MS,
  usoParcial,
} from "./presupuesto";

describe("presupuesto de tiempo", () => {
  it("el default es seguro para el timeout síncrono de Netlify (< 10 s)", () => {
    expect(PRESUPUESTO_RESPUESTA_MS).toBeLessThan(10_000);
    expect(TIMEOUT_PROVEEDOR_VOZ_MS).toBeLessThan(PRESUPUESTO_RESPUESTA_MS);
  });
  it("restante y corte", () => {
    expect(restanteMs(1000, 4000, 9000)).toBe(6000);
    expect(restanteMs(0, 10_000, 9000)).toBe(-1000);
    expect(msHastaElCorte(0, 0, 9000)).toBe(9000 - MARGEN_CIERRE_MS);
    expect(msHastaElCorte(0, 20_000, 9000)).toBe(1000); // piso
  });
  it("el timeout del SDK siempre es posterior al corte", () => {
    for (const ahora of [0, 3000, 8500, 30_000]) {
      expect(timeoutSdkMs(0, ahora, 9000)).toBe(msHastaElCorte(0, ahora, 9000) + HOLGURA_TIMEOUT_SDK_MS);
    }
  });
  it("el mínimo para otra vuelta escala con el presupuesto y tiene techo", () => {
    expect(minimoParaOtraVueltaMs(9000)).toBe(2700);
    expect(minimoParaOtraVueltaMs(25_000)).toBe(7500);
    expect(minimoParaOtraVueltaMs(60_000)).toBe(8000);
  });
  it("alcanzaParaOtraVuelta con el default permite una segunda vuelta tras una primera de ~4 s", () => {
    expect(alcanzaParaOtraVuelta(restanteMs(0, 4000))).toBe(true);
    expect(alcanzaParaOtraVuelta(restanteMs(0, 7000))).toBe(false);
  });
  it("la nota de corte aclara lo guardado", () => {
    expect(textoCortePorTiempo(0)).not.toContain("guardar");
    expect(textoCortePorTiempo(2)).toContain("ya quedó guardado");
  });
  it("usoParcial suma lo que el stream ya reportó y es robusto", () => {
    expect(usoParcial({ usage: { input_tokens: 120, output_tokens: 8 } })).toEqual({ input: 120, output: 8, cacheRead: 0, cacheWrite: 0 });
    expect(usoParcial(undefined)).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(usoParcial({ usage: { input_tokens: Number.NaN, output_tokens: -3 } })).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(
      usoParcial({ usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 4000, cache_creation_input_tokens: null } })
    ).toEqual({ input: 5, output: 1, cacheRead: 4000, cacheWrite: 0 });
    expect(usoParcial({})).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });
});
