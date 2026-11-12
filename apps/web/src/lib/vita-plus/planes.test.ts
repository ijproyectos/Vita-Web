import { describe, expect, it } from "vitest";
import {
  calcularPesos,
  cotizarPlanes,
  esPlanVitaPlus,
  fechaLarga,
  formatoCotizacion,
  formatoPesos,
  formatoUsd,
  PLANES_VITA_PLUS,
  textoPesosPorPeriodo,
  validarCotizacion,
} from "./planes";

describe("precios de los planes", () => {
  it("anual es US$ 35,88 por año (US$ 2,99 por mes) y mensual US$ 4,99", () => {
    expect(PLANES_VITA_PLUS.anual).toMatchObject({ meses: 12, usdCentavos: 3588, usdPorMesCentavos: 299 });
    expect(PLANES_VITA_PLUS.mensual).toMatchObject({ meses: 1, usdCentavos: 499, usdPorMesCentavos: 499 });
    expect(PLANES_VITA_PLUS.anual.usdCentavos / 12).toBeCloseTo(299, 0);
  });

  it("solo acepta claves de plan conocidas", () => {
    expect(esPlanVitaPlus("anual")).toBe(true);
    expect(esPlanVitaPlus("mensual")).toBe(true);
    expect(esPlanVitaPlus("gratis")).toBe(false);
    expect(esPlanVitaPlus(undefined)).toBe(false);
  });
});

describe("pesificación", () => {
  it("redondea al peso entero por plan", () => {
    expect(calcularPesos(499, 1252)).toBe(6247); // 6247,48
    expect(calcularPesos(499, 1560)).toBe(7784); // 7784,4
    expect(calcularPesos(3588, 1560)).toBe(55973); // 55972,8
    expect(calcularPesos(3588, 1252.5)).toBe(44940); // 44939,7
  });

  it("redondea hacia arriba desde .5", () => {
    expect(calcularPesos(100, 1000.5)).toBe(1001); // 1000,5
    expect(calcularPesos(100, 1000.4)).toBe(1000);
  });

  it("cotizarPlanes calcula los dos planes con la misma cotización", () => {
    const c = cotizarPlanes(1560, "2026-10-31T12:00:00.000Z");
    expect(c.pesos).toEqual({ anual: 55973, mensual: 7784 });
    expect(c.fx).toBe(1560);
  });
});

describe("validarCotizacion", () => {
  it("acepta un número sensato", () => {
    expect(validarCotizacion(1560)).toBe(1560);
    expect(validarCotizacion(100)).toBe(100);
    expect(validarCotizacion(100_000)).toBe(100_000);
  });

  it("rechaza lo insensato o lo que no es número", () => {
    for (const malo of [0, -5, 99.99, 100_001, NaN, Infinity, "1560", null, undefined, {}]) {
      expect(validarCotizacion(malo)).toBeNull();
    }
  });
});

describe("formatos", () => {
  it("pesos con puntos de mil", () => {
    expect(formatoPesos(6250)).toBe("$ 6.250");
    expect(formatoPesos(55973)).toBe("$ 55.973");
    expect(formatoPesos(950)).toBe("$ 950");
    expect(formatoPesos(1234567)).toBe("$ 1.234.567");
  });

  it("dólares con coma y dos decimales", () => {
    expect(formatoUsd(299)).toBe("US$ 2,99");
    expect(formatoUsd(499)).toBe("US$ 4,99");
    expect(formatoUsd(3588)).toBe("US$ 35,88");
    expect(formatoUsd(500)).toBe("US$ 5,00");
    expect(formatoUsd(5)).toBe("US$ 0,05");
  });

  it("cotización con o sin decimales", () => {
    expect(formatoCotizacion(1252)).toBe("1.252");
    expect(formatoCotizacion(1252.5)).toBe("1.252,50");
  });

  it("texto por período", () => {
    expect(textoPesosPorPeriodo("mensual", 6250)).toBe("$ 6.250 por mes");
    expect(textoPesosPorPeriodo("anual", 44940)).toBe("$ 44.940 por año");
  });

  it("fecha larga en hora argentina", () => {
    expect(fechaLarga("2026-11-12T12:00:00.000Z")).toBe("12 de noviembre de 2026");
    // 01:00 UTC del 13 sigue siendo 12 en Argentina (UTC-3).
    expect(fechaLarga("2026-11-13T01:00:00.000Z")).toBe("12 de noviembre de 2026");
    expect(fechaLarga("no-es-fecha")).toBe("");
  });
});

describe("motivos de baja", () => {
  it("solo acepta las claves del CHECK de la migración 059", async () => {
    const { readFileSync } = await import("node:fs");
    const { esMotivoBaja, MOTIVOS_BAJA } = await import("./planes");
    const sql = readFileSync(new URL("../../../../../supabase/migrations/059_vita_plus_motivos_baja.sql", import.meta.url), "utf8");
    for (const m of MOTIVOS_BAJA) {
      expect(esMotivoBaja(m.clave)).toBe(true);
      expect(sql).toContain(`'${m.clave}'`);
    }
    for (const v of ["Es caro", "", null, undefined, 3, "borrar"]) expect(esMotivoBaja(v)).toBe(false);
  });
});
