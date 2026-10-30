import { describe, expect, it } from "vitest";
import { calcularUso } from "./tipos";

describe("calcularUso", () => {
  it("uso parcial", () => {
    expect(calcularUso(3, 10)).toEqual({ usados: 3, limite: 10, restantes: 7, porcentajeUsado: 30, agotado: false });
  });
  it("justo en el límite está agotado", () => {
    const r = calcularUso(10, 10);
    expect(r.agotado).toBe(true);
    expect(r.restantes).toBe(0);
    expect(r.porcentajeUsado).toBe(100);
  });
  it("pasarse del límite no da negativos ni más de 100%", () => {
    const r = calcularUso(15, 10);
    expect(r.restantes).toBe(0);
    expect(r.porcentajeUsado).toBe(100);
    expect(r.agotado).toBe(true);
  });
  it("cero usado", () => {
    expect(calcularUso(0, 10)).toMatchObject({ restantes: 10, porcentajeUsado: 0, agotado: false });
  });
  it("redondea el porcentaje", () => {
    expect(calcularUso(1, 3).porcentajeUsado).toBe(33);
    expect(calcularUso(2, 3).porcentajeUsado).toBe(67);
  });
  it("límite 0 cuenta como agotado", () => {
    expect(calcularUso(0, 0).agotado).toBe(true);
  });
  it("límite 0 da un porcentaje numérico (100 %)", () => {
    expect(calcularUso(0, 0).porcentajeUsado).toBe(100);
  });
});
