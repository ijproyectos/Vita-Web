import { describe, expect, it } from "vitest";
import { acotarEntero, buscarMedicamentoContado, claveMedicamento, esStockBajo, separarDosis, textoQuedan } from "./tipos";

describe("claveMedicamento", () => {
  it("normaliza mayúsculas y espacios", () => {
    expect(claveMedicamento("  Metformina ", " 850 ")).toBe("metformina|850");
  });
  it("dosis null/undefined/vacía dan la misma clave", () => {
    const k = claveMedicamento("Aspirina", null);
    expect(k).toBe("aspirina|");
    expect(claveMedicamento("Aspirina", undefined)).toBe(k);
    expect(claveMedicamento("Aspirina", "  ")).toBe(k);
  });
  it("es consistente con la agrupación por nombre+dosis", () => {
    expect(claveMedicamento("A", "1")).not.toBe(claveMedicamento("A", "2"));
  });
});

describe("separarDosis", () => {
  it.each([
    ["500 mg", { valor: "500", unidad: "mg" }],
    ["850mg", { valor: "850", unidad: "mg" }],
    ["5 ml", { valor: "5", unidad: "ml" }],
    ["5 ML", { valor: "5", unidad: "ml" }],
    ["10 UI", { valor: "10", unidad: "UI" }],
    ["10 ui", { valor: "10", unidad: "UI" }],
    ["1 comp.", { valor: "1", unidad: "comp." }],
    ["1 comp", { valor: "1", unidad: "comp." }],
    ["20 gotas", { valor: "20", unidad: "gotas" }],
    ["2,5 mg", { valor: "2.5", unidad: "mg" }],
    ["0.5mg", { valor: "0.5", unidad: "mg" }],
    ["500", { valor: "500", unidad: null }],
  ])("%j", (entrada, esperado) => {
    expect(separarDosis(entrada)).toEqual(esperado);
  });

  it("mcg es una unidad soportada", () => {
    expect(separarDosis("100 mcg")).toEqual({ valor: "100", unidad: "mcg" });
  });
  it("unidad no soportada conserva el texto entero", () => {
    expect(separarDosis("100 xyz")).toEqual({ valor: "100 xyz", unidad: null });
  });
  it("texto sin número inicial se conserva", () => {
    expect(separarDosis("media pastilla")).toEqual({ valor: "media pastilla", unidad: null });
  });
  it("vacío / null / undefined", () => {
    expect(separarDosis("")).toEqual({ valor: "", unidad: null });
    expect(separarDosis("   ")).toEqual({ valor: "", unidad: null });
    expect(separarDosis(null)).toEqual({ valor: "", unidad: null });
    expect(separarDosis(undefined)).toEqual({ valor: "", unidad: null });
  });
});

describe("esStockBajo / textoQuedan", () => {
  it("bajo es estrictamente menor que el umbral", () => {
    expect(esStockBajo(4, 5)).toBe(true);
    expect(esStockBajo(5, 5)).toBe(false);
  });
  it("textos singular, plural y agotado", () => {
    expect(textoQuedan(0)).toBe("No quedan pastillas");
    expect(textoQuedan(-3)).toBe("No quedan pastillas");
    expect(textoQuedan(1)).toBe("Queda 1 pastilla");
    expect(textoQuedan(7)).toBe("Quedan 7 pastillas");
  });
});

describe("acotarEntero", () => {
  it("acota y redondea", () => {
    expect(acotarEntero(5.6, 0, 10)).toBe(6);
    expect(acotarEntero(-3, 0, 10)).toBe(0);
    expect(acotarEntero(99, 0, 10)).toBe(10);
  });
  it("acepta strings numéricos", () => {
    expect(acotarEntero("7", 0, 10)).toBe(7);
  });
  it("no numérico devuelve el mínimo", () => {
    expect(acotarEntero("abc", 1, 10)).toBe(1);
    expect(acotarEntero(NaN, 1, 10)).toBe(1);
    expect(acotarEntero(Infinity, 1, 10)).toBe(1);
    expect(acotarEntero(undefined, 1, 10)).toBe(1);
  });
  it("OJO: null y '' se convierten a 0 y quedan acotados al mínimo", () => {
    expect(acotarEntero(null, 1, 10)).toBe(1);
    expect(acotarEntero("", 0, 10)).toBe(0);
  });
});

describe("textoQuedan por forma", () => {
  it("usa la unidad de cada forma y coma decimal", () => {
    expect(textoQuedan(30, "jarabe")).toBe("Quedan 30 ml");
    expect(textoQuedan(12.5, "pastilla")).toBe("Quedan 12,5 pastillas");
    expect(textoQuedan(1, "inyeccion")).toBe("Queda 1 unidad");
    expect(textoQuedan(0, "gotas")).toBe("No queda nada");
  });
});

describe("buscarMedicamentoContado", () => {
  const c = (nombre: string, dosis: string | null) => ({ clave: claveMedicamento(nombre, dosis), nombre, dosis });
  const forxiga = c("Forxiga (Dapagliflozina)", "10");
  const metformina = c("Metformina", "850");

  it("encuentra por clave exacta", () => {
    expect(buscarMedicamentoContado([forxiga, metformina], "metformina", "850")).toBe(metformina);
  });

  it("el blister con el nombre comercial encuentra 'Marca (Droga)'", () => {
    expect(buscarMedicamentoContado([forxiga, metformina], "Forxiga", "10")).toBe(forxiga);
    expect(buscarMedicamentoContado([forxiga], "Forxiga", null)).toBe(forxiga);
  });

  it("también encuentra por la droga", () => {
    expect(buscarMedicamentoContado([forxiga], "Dapagliflozina", "10")).toBe(forxiga);
  });

  it("encuentra por la columna droga", () => {
    const conColumna = { ...c("Forxiga", "10"), droga: "Dapagliflozina" };
    expect(buscarMedicamentoContado([conColumna], "Dapagliflozina", "10")).toBe(conColumna);
  });

  it("con dosis distinta no lo enlaza", () => {
    expect(buscarMedicamentoContado([forxiga], "Forxiga", "5")).toBeUndefined();
  });

  it("sin dosis y dos con el mismo nombre, no adivina", () => {
    const otra = c("Forxiga", "5");
    expect(buscarMedicamentoContado([forxiga, otra], "Forxiga", null)).toBeUndefined();
  });
});
