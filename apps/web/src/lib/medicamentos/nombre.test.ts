import { describe, expect, it } from "vitest";
import { nombreConDroga, separarNombreDroga } from "./nombre";

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

describe("nombreConDroga", () => {
  it("arma 'Marca (Droga)'", () => {
    expect(nombreConDroga("Forxiga", "Dapagliflozina")).toBe("Forxiga (Dapagliflozina)");
  });

  it("sin droga, o si es igual al nombre, deja el nombre solo", () => {
    expect(nombreConDroga("Metformina", null)).toBe("Metformina");
    expect(nombreConDroga("Metformina", "metformina")).toBe("Metformina");
  });
});
