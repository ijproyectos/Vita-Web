import { describe, expect, it } from "vitest";
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

  it("descarta horas inválidas sin desalinear las comidas", () => {
    expect(leerTomas(form(["25:00", "09:00"], ["antes", "con"]))).toEqual([{ hora: "09:00", conComida: "con", indicacion: null }]);
  });

  it("deduplica por hora normalizada (gana la primera)", () => {
    expect(leerTomas(form(["8:00", "08:00", "08:00:00"], ["antes", "con", "despues"]))).toEqual([
      { hora: "08:00", conComida: "antes", indicacion: null },
    ]);
  });

  it("comida inválida o ausente cae en no-importa", () => {
    expect(leerTomas(form(["08:00", "09:00"], ["pizza"]))).toEqual([
      { hora: "08:00", conComida: "no-importa", indicacion: null },
      { hora: "09:00", conComida: "no-importa", indicacion: null },
    ]);
  });

  it("respeta el tope MAX_TOMAS", () => {
    const horas = Array.from({ length: 10 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);
    const r = leerTomas(form(horas, horas.map(() => "con")));
    expect(r).toHaveLength(MAX_TOMAS);
    expect(r[MAX_TOMAS - 1].hora).toBe("11:00");
  });

  it("las inválidas no consumen cupo del tope", () => {
    const horas = ["99:99", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"];
    const r = leerTomas(form(horas, []));
    expect(r.map((x) => x.hora)).toEqual(["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"]);
  });
});
