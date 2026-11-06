import { describe, expect, it } from "vitest";
import { destinoDeInicio } from "./inicio";

describe("destinoDeInicio", () => {
  it("Lector mirando a otra persona ve solo mirar aunque tenga modo simple", () => {
    expect(destinoDeInicio({ soloMirar: true, modoSimpleActivo: true })).toBe("solo-mirar");
    expect(destinoDeInicio({ soloMirar: true, modoSimpleActivo: false })).toBe("solo-mirar");
  });
  it("perfil propio con modo simple activo va al modo simple", () => {
    expect(destinoDeInicio({ soloMirar: false, modoSimpleActivo: true })).toBe("modo-simple");
  });
  it("sin nada especial muestra el inicio normal", () => {
    expect(destinoDeInicio({ soloMirar: false, modoSimpleActivo: false })).toBe("normal");
  });
});
