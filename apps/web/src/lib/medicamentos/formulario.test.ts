import { describe, expect, it } from "vitest";
import { ErrorEntradaMedicamento } from "./duplicados";
import {
  MAX_TOMAS,
  leerPlanMedicamento,
  leerTomas,
  normalizarCantidad,
  normalizarDias,
  normalizarFechaFin,
  normalizarForma,
} from "./formulario";
import { DIAS_SEMANA } from "./tipos";

function form(horas: string[], comidas: string[]): FormData {
  const fd = new FormData();
  horas.forEach((h) => fd.append("tomaHora", h));
  comidas.forEach((c) => fd.append("tomaComida", c));
  return fd;
}

describe("leerTomas", () => {
  it("sin campos devuelve vacío", () => {
    expect(leerTomas(new FormData())).toEqual([]);
  });

  it("lee pares hora/comida en orden y normaliza la hora", () => {
    expect(leerTomas(form(["8:00", "21:30"], ["con", "despues"]))).toEqual([
      { hora: "08:00", conComida: "con", indicacion: null },
      { hora: "21:30", conComida: "despues", indicacion: null },
    ]);
  });

  it("rechaza una hora inválida en vez de descartarla", () => {
    expect(() => leerTomas(form(["25:00", "09:00"], ["antes", "con"]))).toThrow(ErrorEntradaMedicamento);
    expect(() => leerTomas(form(["", "09:00"], []))).toThrow("Revisá los horarios");
  });

  it("rechaza horas repetidas (misma hora normalizada)", () => {
    expect(() => leerTomas(form(["8:00", "08:00", "08:00:00"], []))).toThrow("repetidos");
  });

  it("comida inválida o ausente cae en no-importa", () => {
    expect(leerTomas(form(["08:00", "09:00"], ["pizza"]))).toEqual([
      { hora: "08:00", conComida: "no-importa", indicacion: null },
      { hora: "09:00", conComida: "no-importa", indicacion: null },
    ]);
  });

  it("rechaza más de MAX_TOMAS tomas", () => {
    const horas = Array.from({ length: MAX_TOMAS + 1 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);
    expect(() => leerTomas(form(horas, []))).toThrow(`hasta ${MAX_TOMAS}`);
  });

  it("acepta exactamente MAX_TOMAS tomas", () => {
    const horas = Array.from({ length: MAX_TOMAS }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);
    expect(leerTomas(form(horas, []))).toHaveLength(MAX_TOMAS);
  });
});

describe("plan del medicamento", () => {
  const HOY = "2026-11-09";

  it("lee cantidades y campos de Cuándo", () => {
    const fd = form(["08:00", "20:00"], ["con", "con"]);
    fd.append("tomaCantidad", "0.5");
    fd.append("tomaCantidad", "1");
    fd.append("forma", "pastilla");
    fd.append("dia", "lunes");
    fd.append("fechaFin", "2026-11-15");
    expect(leerTomas(fd).map((t) => t.cantidad)).toEqual([0.5, 1]);
    expect(leerPlanMedicamento(fd)).toEqual({ droga: null, forma: "pastilla", diasRecurrentes: ["lunes"], fechaFin: "2026-11-15" });
  });

  it("lee la droga sin espacios de más", () => {
    const fd = new FormData();
    fd.append("droga", "  Dapagliflozina ");
    expect(leerPlanMedicamento(fd).droga).toBe("Dapagliflozina");
  });

  it("normalizarForma rechaza lo desconocido", () => {
    expect(normalizarForma(undefined)).toBe("pastilla");
    expect(normalizarForma("gotas")).toBe("gotas");
    expect(() => normalizarForma("polvo")).toThrow(ErrorEntradaMedicamento);
  });

  it("normalizarDias valida y trata los 7 como todos", () => {
    expect(normalizarDias(["lunes", "lunes"])).toEqual(["lunes"]);
    expect(normalizarDias(DIAS_SEMANA)).toEqual([]);
    expect(() => normalizarDias(["feriado"])).toThrow(ErrorEntradaMedicamento);
  });

  it("normalizarFechaFin rechaza una fecha pasada salvo la ya guardada", () => {
    expect(normalizarFechaFin("", HOY)).toBeNull();
    expect(normalizarFechaFin(HOY, HOY)).toBe(HOY);
    expect(() => normalizarFechaFin("2026-11-08", HOY)).toThrow("ya pasó");
    expect(normalizarFechaFin("2026-11-08", HOY, "2026-11-08")).toBe("2026-11-08");
    expect(() => normalizarFechaFin("2026-13-01", HOY)).toThrow("Revisá");
  });

  it("normalizarCantidad acepta decimales y rechaza lo inválido", () => {
    expect(normalizarCantidad(undefined)).toBeNull();
    expect(normalizarCantidad(0.5)).toBe(0.5);
    for (const malo of [0, -1, 61, Number.NaN]) expect(() => normalizarCantidad(malo)).toThrow(ErrorEntradaMedicamento);
  });
});
