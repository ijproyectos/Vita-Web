import { describe, expect, it } from "vitest";
import { alternarDia, CUANDO_INICIAL, fechaFinDe, fechaHoyAR, fechaValida, resumenCuando, vigenteEnFecha } from "./cuando";
import { DIAS_SEMANA } from "./tipos";

const HOY = "2026-11-09";

describe("fechaFinDe", () => {
  it("sin fin cuando es siempre", () => {
    expect(fechaFinDe({ hasta: "siempre", fechaElegida: "" }, HOY)).toBeNull();
  });
  it("cuenta hoy como primer día", () => {
    expect(fechaFinDe({ hasta: 1, fechaElegida: "" }, HOY)).toBe(HOY);
    expect(fechaFinDe({ hasta: 7, fechaElegida: "" }, HOY)).toBe("2026-11-15");
  });
  it("cruza el fin de mes", () => {
    expect(fechaFinDe({ hasta: 30, fechaElegida: "" }, HOY)).toBe("2026-12-08");
  });
  it("usa la fecha elegida, o null si falta", () => {
    expect(fechaFinDe({ hasta: "fecha", fechaElegida: "2026-12-01" }, HOY)).toBe("2026-12-01");
    expect(fechaFinDe({ hasta: "fecha", fechaElegida: "" }, HOY)).toBeNull();
  });
});

describe("resumenCuando", () => {
  it("todos los días sin fin", () => {
    expect(resumenCuando(CUANDO_INICIAL, HOY)).toBe("Todos los días · sin fecha de fin");
  });
  it("ordena los días aunque se elijan salteados", () => {
    expect(resumenCuando({ dias: ["viernes", "lunes"], hasta: 1, fechaElegida: "" }, HOY)).toBe("Lun · Vie · solo hoy");
  });
  it("muestra días y fecha", () => {
    expect(resumenCuando({ dias: [], hasta: 7, fechaElegida: "" }, HOY)).toBe("Todos los días · 7 días, hasta el 15/11");
  });
  it("pide la fecha si falta", () => {
    expect(resumenCuando({ dias: [], hasta: "fecha", fechaElegida: "" }, HOY)).toBe("Todos los días · elegí la fecha");
  });
});

describe("alternarDia", () => {
  it("agrega y saca", () => {
    expect(alternarDia([], "lunes")).toEqual(["lunes"]);
    expect(alternarDia(["lunes"], "lunes")).toEqual([]);
  });
  it("los 7 días equivalen a todos", () => {
    expect(alternarDia(DIAS_SEMANA.filter((d) => d !== "domingo"), "domingo")).toEqual([]);
  });
});

describe("vigenteEnFecha", () => {
  it("sin fin siempre está vigente", () => {
    expect(vigenteEnFecha({ fecha_fin: null }, HOY)).toBe(true);
    expect(vigenteEnFecha({}, HOY)).toBe(true);
  });
  it("el último día todavía cuenta y el siguiente no", () => {
    expect(vigenteEnFecha({ fecha_fin: HOY }, HOY)).toBe(true);
    expect(vigenteEnFecha({ fecha_fin: HOY }, "2026-11-10")).toBe(false);
  });
});

describe("fechaValida", () => {
  it("rechaza formatos y fechas imposibles", () => {
    expect(fechaValida("2026-11-09")).toBe("2026-11-09");
    expect(fechaValida("2026-02-30")).toBeNull();
    expect(fechaValida("09/11/2026")).toBeNull();
    expect(fechaValida(null)).toBeNull();
  });
});

it("fechaHoyAR usa la zona de Argentina", () => {
  expect(fechaHoyAR(new Date("2026-11-10T02:00:00Z"))).toBe("2026-11-09");
});
