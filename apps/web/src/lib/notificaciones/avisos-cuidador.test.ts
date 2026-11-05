import { describe, expect, it } from "vitest";
import { avisosDeCuidador } from "./avisos-cuidador";

const titulos = (rol: "editar" | "ver") => avisosDeCuidador(rol).map((a) => a.titulo);

describe("avisosDeCuidador", () => {
  it("un Lector no recibe el aviso de stock", () => {
    expect(titulos("ver")).toEqual(["Tomas sin confirmar", "Turnos", "Resumen del día"]);
  });
  it("un Admin recibe también el aviso de stock", () => {
    expect(titulos("editar")).toEqual(["Tomas sin confirmar", "Remedio por terminarse", "Turnos", "Resumen del día"]);
  });
});
