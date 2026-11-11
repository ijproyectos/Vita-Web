import { describe, expect, it } from "vitest";
import { comoLlamarla } from "./como-llamarla";

describe("comoLlamarla", () => {
  it("usa la relación cuando es clara", () => {
    expect(comoLlamarla("Elsa Pérez", "Mamá")).toEqual({ inicio: "Mamá", medio: "mamá" });
    expect(comoLlamarla("Raúl", " papa ")).toEqual({ inicio: "Papá", medio: "papá" });
    expect(comoLlamarla("Rosa", "Abuela")).toEqual({ inicio: "Abuela", medio: "abuela" });
  });
  it("si no es clara o no hay, el primer nombre", () => {
    for (const r of [null, undefined, "", "Otro", "Hijo/a", "Pareja", "Abuela/o", "Amiga"]) {
      expect(comoLlamarla("Elsa Pérez", r)).toEqual({ inicio: "Elsa", medio: "Elsa" });
    }
  });
  it("sin nombre ni relación, 'tu familiar'", () => {
    expect(comoLlamarla("", null)).toEqual({ inicio: "Tu familiar", medio: "tu familiar" });
  });
});
