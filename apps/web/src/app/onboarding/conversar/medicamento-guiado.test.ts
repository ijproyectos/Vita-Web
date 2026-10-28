import { describe, expect, it } from "vitest";
import { etiquetaDeToma, leerDosis, lineaDeToma, tituloMed, UNIDAD_POR_CHIP, CHIPS_UNIDAD } from "./medicamento-guiado";

describe("leerDosis", () => {
  it("lee valor y unidad", () => {
    expect(leerDosis("50 mg")).toEqual({ tipo: "completa", valor: "50", unidad: "mg" });
  });
  it("sin unidad devuelve solo el número", () => {
    expect(leerDosis("50")).toEqual({ tipo: "sin-unidad", numero: "50" });
  });
  it("combinación de dos drogas queda tal cual", () => {
    expect(leerDosis("500 / 30 mg")).toEqual({ tipo: "completa", valor: "500/30", unidad: "mg" });
  });
  it("texto que no es una dosis es ilegible", () => {
    expect(leerDosis("no sé")).toEqual({ tipo: "ilegible" });
    expect(leerDosis("")).toEqual({ tipo: "ilegible" });
  });
});

describe("etiquetaDeToma", () => {
  it("null si hay una sola toma", () => {
    expect(etiquetaDeToma(0, 1)).toBeNull();
  });
  it("ordinal si hay varias, también pasado el catálogo", () => {
    expect(etiquetaDeToma(0, 2)).toBe("1.ª toma");
    expect(etiquetaDeToma(7, 9)).toBe("8.ª toma");
  });
});

describe("tituloMed / lineaDeToma", () => {
  it("arma el título con y sin dosis", () => {
    expect(tituloMed({ nombre: "Losartán", dosis: "50", unidad: "mg" })).toBe("Losartán 50 mg");
    expect(tituloMed({ nombre: "Losartán", dosis: null, unidad: "mg" })).toBe("Losartán");
  });
  it("la línea de toma omite la indicación si no hay", () => {
    expect(lineaDeToma({ hora: "08:00", conComida: "no-importa", indicacion: null })).toBe("08:00");
  });
});

describe("chips de unidad", () => {
  it("cada chip mapea a una unidad", () => {
    for (const c of CHIPS_UNIDAD) expect(UNIDAD_POR_CHIP[c]).toBeTruthy();
    expect(UNIDAD_POR_CHIP.comprimidos).toBe("comp.");
  });
});
