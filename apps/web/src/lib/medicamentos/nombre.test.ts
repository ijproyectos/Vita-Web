import { describe, expect, it } from "vitest";
import { mismoRemedioConOtroNombre, normalizarNombreYDroga, separarNombreDroga } from "./nombre";

describe("separarNombreDroga", () => {
  it("separa el nombre comercial de la droga entre paréntesis", () => {
    expect(separarNombreDroga("Forxiga (Dapagliflozina)")).toEqual({ nombre: "Forxiga", droga: "Dapagliflozina" });
  });

  it("tolera espacios de más", () => {
    expect(separarNombreDroga("  Ibupirac   ( Ibuprofeno )  ")).toEqual({ nombre: "Ibupirac", droga: "Ibuprofeno" });
  });

  it("sin paréntesis devuelve el nombre entero y sin droga", () => {
    expect(separarNombreDroga("Metformina")).toEqual({ nombre: "Metformina", droga: null });
  });

  it("un paréntesis vacío o sin cerrar no cuenta como droga", () => {
    expect(separarNombreDroga("Forxiga ()")).toEqual({ nombre: "Forxiga ()", droga: null });
    expect(separarNombreDroga("Forxiga (Dapa")).toEqual({ nombre: "Forxiga (Dapa", droga: null });
  });

  it("solo un paréntesis no deja nombre: queda todo como nombre", () => {
    expect(separarNombreDroga("(Dapagliflozina)")).toEqual({ nombre: "(Dapagliflozina)", droga: null });
  });
});

describe("normalizarNombreYDroga", () => {
  it("saca la droga del paréntesis y deja el nombre que se muestra", () => {
    expect(normalizarNombreYDroga("Forxiga (Dapagliflozina)")).toEqual({ nombre: "Forxiga", droga: "Dapagliflozina" });
  });

  it("una droga explícita manda sobre la del paréntesis", () => {
    expect(normalizarNombreYDroga("Forxiga (Dapa)", "Dapagliflozina")).toEqual({ nombre: "Forxiga", droga: "Dapagliflozina" });
  });

  it("sin droga ni paréntesis: undefined si no vino (no tocar), null si vino vacía", () => {
    expect(normalizarNombreYDroga("Metformina")).toEqual({ nombre: "Metformina", droga: undefined });
    expect(normalizarNombreYDroga("Metformina", null)).toEqual({ nombre: "Metformina", droga: null });
    expect(normalizarNombreYDroga("Metformina", "  ")).toEqual({ nombre: "Metformina", droga: null });
  });

  it("acota el largo de la droga", () => {
    expect(normalizarNombreYDroga("X", "a".repeat(200)).droga).toHaveLength(80);
  });
});

describe("mismoRemedioConOtroNombre", () => {
  const forxiga = { nombre: "Forxiga", droga: "Dapagliflozina" };

  it("el genérico de una marca ya cargada es el mismo remedio", () => {
    expect(mismoRemedioConOtroNombre([forxiga], { nombre: "Dapagliflozina", droga: null })).toBe(forxiga);
  });

  it("otra marca de la misma droga también", () => {
    expect(mismoRemedioConOtroNombre([forxiga], { nombre: "Otra marca", droga: "dapagliflozina" })).toBe(forxiga);
  });

  it("una marca nueva cuya droga es el nombre de uno cargado", () => {
    const generico = { nombre: "Dapagliflozina", droga: null };
    expect(mismoRemedioConOtroNombre([generico], { nombre: "Forxiga", droga: "Dapagliflozina" })).toBe(generico);
  });

  it("el mismo nombre o remedios distintos no avisan", () => {
    expect(mismoRemedioConOtroNombre([forxiga], { nombre: "Forxiga", droga: "Dapagliflozina" })).toBeNull();
    expect(mismoRemedioConOtroNombre([forxiga], { nombre: "Metformina", droga: null })).toBeNull();
  });
});
