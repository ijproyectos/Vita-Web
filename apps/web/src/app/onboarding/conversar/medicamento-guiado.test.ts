import { describe, expect, it } from "vitest";
import { frecuenciaDeHoras, moverHora, siguienteHoraMed, horasDeRemedio, textoHoras, textoVeces, tomasDesdeHoras, leerDosis, remediosVisibles, lineaDeToma, tituloMed, UNIDAD_POR_CHIP, CHIPS_UNIDAD } from "./medicamento-guiado";

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

describe("resumen de remedios", () => {
  it("deja solo las horas", () => {
    expect(horasDeRemedio(["08:00 · Con el desayuno", "20:00"])).toBe("08:00 · 20:00");
  });
  it("corta la lista larga y no esconde uno solo", () => {
    const seis = [1, 2, 3, 4, 5, 6];
    expect(remediosVisibles(seis, false)).toEqual({ visibles: [1, 2, 3, 4], ocultos: 2 });
    expect(remediosVisibles(seis, true)).toEqual({ visibles: seis, ocultos: 0 });
    expect(remediosVisibles([1, 2, 3, 4, 5], false)).toEqual({ visibles: [1, 2, 3, 4, 5], ocultos: 0 });
  });
});

describe("horas del remedio", () => {
  it("mueve la hora y da la vuelta al día", () => {
    expect(moverHora("08:00", 30)).toBe("08:30");
    expect(moverHora("23:30", 30)).toBe("00:00");
    expect(moverHora("00:00", -30)).toBe("23:30");
  });
  it("propone el próximo horario sin repetir", () => {
    expect(siguienteHoraMed(["08:00"])).toBe("20:00");
    expect(siguienteHoraMed(["08:00", "20:00"])).toBe("02:00");
    expect(siguienteHoraMed(["08:00", "14:00", "20:00", "02:00"].slice(0, 2).concat("20:00"))).toBe("02:00");
    expect(siguienteHoraMed(["20:00", "02:00", "08:00"])).toBe("14:00");
  });
  it("arma los textos", () => {
    expect(textoHoras(["08:00"])).toBe("08:00");
    expect(textoHoras(["08:00", "14:00", "21:00"])).toBe("08:00, 14:00 y 21:00");
    expect(textoVeces(1)).toBe("1 vez por día");
    expect(textoVeces(2)).toBe("2 veces por día");
    expect(frecuenciaDeHoras(["08:00", "20:00"])).toBe("2x día");
  });
  it("cada hora es una toma sin comida", () => {
    expect(tomasDesdeHoras(["08:00"])).toEqual([{ hora: "08:00", conComida: "no-importa", indicacion: null }]);
  });
});
