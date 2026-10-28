import { describe, expect, it } from "vitest";
import { ErrorEntradaMedicamento } from "./duplicados";
import { MAX_TOMAS, leerTomas } from "./formulario";

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
