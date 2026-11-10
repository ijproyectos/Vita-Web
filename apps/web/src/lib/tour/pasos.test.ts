import { describe, expect, it } from "vitest";
import { pasosTour, pasosVisibles, posicionGlobo } from "./pasos";

describe("tour", () => {
  it("saltea lo que no está en pantalla y siempre deja el cierre", () => {
    const r = pasosVisibles(pasosTour("Mica"), (c) => c === "vita");
    expect(r.map((p) => p.clave)).toEqual(["vita", null]);
    expect(r[1].titulo).toContain("Mica");
  });
  it("el globo va abajo de lo que está arriba y arriba de lo que está abajo", () => {
    expect(posicionGlobo({ x: 0, y: 40, w: 50, h: 50 }, 800)).toEqual({ top: 106, flechaArriba: true });
    expect(posicionGlobo({ x: 0, y: 720, w: 50, h: 50 }, 800)).toEqual({ top: 534, flechaArriba: false });
  });
  it("el cierre va centrado y sin flecha", () => {
    expect(posicionGlobo(null, 800)).toEqual({ top: 315, flechaArriba: null });
  });
});
