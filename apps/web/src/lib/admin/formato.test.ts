import { describe, expect, it } from "vitest";
import {
  chipInactividad,
  formatoARS,
  formatoBytes,
  formatoDiaCorto,
  formatoFechaAR,
  formatoFechaHoraAR,
  formatoUSD,
} from "./formato";

describe("chipInactividad", () => {
  it.each([
    [0, "activo"],
    [1, "activo"],
    [2, "reciente"],
    [7, "reciente"],
    [8, "enfriandose"],
    [30, "enfriandose"],
    [31, "inactivo"],
    [400, "inactivo"],
  ])("%i días -> %s", (dias, clave) => {
    expect(chipInactividad(dias).clave).toBe(clave);
  });
  it("sin actividad = inactivo", () => {
    expect(chipInactividad(null)).toMatchObject({ clave: "inactivo", etiqueta: "Sin actividad" });
  });
  it("detalle legible", () => {
    expect(chipInactividad(0).detalle).toBe("hoy");
    expect(chipInactividad(1).detalle).toBe("ayer");
    expect(chipInactividad(5).detalle).toBe("hace 5 días");
  });
});

describe("dinero", () => {
  it("USD con 2 decimales", () => {
    expect(formatoUSD(0.33)).toBe("US$ 0,33");
    expect(formatoUSD(0)).toBe("US$ 0,00");
    expect(formatoUSD(1234.5)).toBe("US$ 1.234,50");
  });
  it("ARS en pesos enteros", () => {
    expect(formatoARS(12345.6)).toBe("$ 12.346");
    expect(formatoARS(0)).toBe("$ 0");
  });
  it("valores no finitos no rompen", () => {
    expect(formatoUSD(Number.NaN)).toBe("US$ 0,00");
    expect(formatoARS(Number.POSITIVE_INFINITY)).toBe("$ 0");
  });
});

describe("formatoBytes", () => {
  it("escala unidades", () => {
    expect(formatoBytes(0)).toBe("0 B");
    expect(formatoBytes(512)).toBe("512 B");
    expect(formatoBytes(1536)).toBe("1,5 KB");
  });
});

describe("fechas en hora de Argentina", () => {
  it("convierte UTC a AR (UTC-3)", () => {
    expect(formatoFechaAR("2026-11-01T02:30:00Z")).toBe("31/10/2026");
    expect(formatoFechaHoraAR("2026-11-01T15:05:00Z")).toBe("01/11/2026, 12:05");
  });
  it("entradas vacías o inválidas devuelven un guion", () => {
    expect(formatoFechaAR(null)).toBe("—");
    expect(formatoFechaAR(undefined)).toBe("—");
    expect(formatoFechaAR("no es una fecha")).toBe("—");
    expect(formatoFechaHoraAR("")).toBe("—");
  });
  it("día corto", () => {
    expect(formatoDiaCorto("2026-11-01")).toBe("01/11");
    expect(formatoDiaCorto("raro")).toBe("raro");
  });
});
