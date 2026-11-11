import { describe, expect, it } from "vitest";
import { sugerirSeparacion } from "./nombre-largo";

describe("sugerirSeparacion", () => {
  it("el caso real: nombre, dosis, días y hora", () => {
    expect(sugerirSeparacion("Losartan 500mg todos los martes, jueves y sabado a las 21hs")).toEqual({
      nombre: "Losartan",
      dosis: "500 mg",
      dias: ["martes", "jueves", "sabado"],
      hora: "21:00",
    });
  });
  it("solo la dosis", () => {
    expect(sugerirSeparacion("Enalapril 10 mg")).toEqual({ nombre: "Enalapril", dosis: "10 mg", dias: [], hora: null });
  });
  it("decimales y hora con minutos", () => {
    expect(sugerirSeparacion("Levotiroxina 0.75 mg a las 7:30")).toEqual({ nombre: "Levotiroxina", dosis: "0,75 mg", dias: [], hora: "07:30" });
  });
  it("días con tilde", () => {
    expect(sugerirSeparacion("Vitamina D los sábados")?.dias).toEqual(["sabado"]);
    expect(sugerirSeparacion("Vitamina D los sábados")?.nombre).toBe("Vitamina D");
  });
  it("un nombre normal no sugiere nada", () => {
    expect(sugerirSeparacion("Ibupirac")).toBeNull();
    expect(sugerirSeparacion("Vitamina D")).toBeNull();
    expect(sugerirSeparacion("Omega 3")).toBeNull();
  });
  it("si no queda nombre, no sugiere", () => {
    expect(sugerirSeparacion("500 mg")).toBeNull();
  });
});
