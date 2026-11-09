import { describe, expect, it } from "vitest";
import { celdasDelMes, credencialDeObraSocial, etiquetaDiaTurno, pasoHora, pasoMinutos, sugerirEspecialidades, tituloMes } from "./alta";

describe("sugerirEspecialidades", () => {
  it("busca sin acentos ni mayúsculas", () => {
    expect(sugerirEspecialidades("CARDIO")[0]).toEqual({ etiqueta: "Cardiología", por: null });
  });
  it("encuentra por palabra clave y dice cuál", () => {
    expect(sugerirEspecialidades("corazon")).toEqual([{ etiqueta: "Cardiología", por: "corazón" }]);
  });
  it("vacío no sugiere y corta en 4", () => {
    expect(sugerirEspecialidades("  ")).toEqual([]);
    expect(sugerirEspecialidades("o").length).toBeLessThanOrEqual(4);
  });
});

describe("credencialDeObraSocial", () => {
  it("usa el nombre sin el número final", () => {
    expect(credencialDeObraSocial("OSDE 210")).toBe("Credencial de OSDE");
  });
  it("sin dato es genérica y particular no lleva", () => {
    expect(credencialDeObraSocial(null)).toBe("Credencial de obra social");
    expect(credencialDeObraSocial("Particular")).toBeNull();
  });
});

describe("celdasDelMes", () => {
  it("empieza la semana en lunes", () => {
    // Noviembre de 2026 empieza domingo: seis huecos.
    const celdas = celdasDelMes(2026, 10);
    expect(celdas.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(celdas.at(-1)).toBe("2026-11-30");
  });
  it("febrero bisiesto", () => {
    expect(celdasDelMes(2028, 1).at(-1)).toBe("2028-02-29");
  });
});

it("etiquetas de fecha", () => {
  expect(etiquetaDiaTurno("2026-11-06")).toBe("vie 6 de noviembre");
  expect(tituloMes(2026, 10)).toBe("Noviembre 2026");
});

describe("selector de hora", () => {
  it("la hora da la vuelta", () => {
    expect(pasoHora(23, 1)).toBe(0);
    expect(pasoHora(0, -1)).toBe(23);
  });
  it("los minutos van de a 5 y dan la vuelta", () => {
    expect(pasoMinutos(30, 1)).toBe(35);
    expect(pasoMinutos(0, -1)).toBe(55);
    expect(pasoMinutos(55, 1)).toBe(0);
    expect(pasoMinutos(32, 1)).toBe(35);
  });
});
