import { describe, expect, it } from "vitest";
import {
  chipInactividad,
  formatoARS,
  formatoBytes,
  formatoDiaCorto,
  formatoFechaAR,
  formatoFechaHoraAR,
  formatoUSD,
  resumenVitaPlus,
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

describe("resumenVitaPlus", () => {
  it("pago con plan, código plus con fecha, código admin sin vencimiento", () => {
    expect(resumenVitaPlus({ permanente: false, origen: "pago", vence: null, plan: "anual" }).etiqueta).toBe("vita+ · Pago (anual)");
    const plus = resumenVitaPlus({ permanente: false, origen: "codigo_plus", vence: "2026-11-16T12:00:00Z", plan: null });
    expect(plus.etiqueta).toBe("vita+ · Código plus");
    expect(plus.detalle).toMatch(/^hasta /);
    expect(resumenVitaPlus({ permanente: true, origen: "codigo_admin", vence: "2026-11-01T00:00:00Z", plan: null })).toEqual({
      etiqueta: "vita+ · Código admin",
      detalle: "sin vencimiento",
    });
  });
  it("sin origen se toma como pago (cuentas anteriores a la 046)", () => {
    expect(resumenVitaPlus({ permanente: false, origen: null, vence: null, plan: null }).etiqueta).toBe("vita+ · Pago");
  });
});
