import { describe, expect, it } from "vitest";
import { agregarTecla, aNumero } from "./teclado";

const entero3 = { decimales: false, maxEnteros: 3 };
const temp = { decimales: true, maxEnteros: 2 };

function escribir(teclas: string, reglas = entero3): string {
  return [...teclas].reduce((v, t) => agregarTecla(v, t, reglas), "");
}

describe("teclado de medición", () => {
  it("enteros con tope de cifras", () => {
    expect(escribir("1355")).toBe("135");
    expect(escribir("0")).toBe("0");
    expect(escribir("07")).toBe("7");
  });
  it("sin decimales ignora la coma", () => {
    expect(escribir("12,5")).toBe("125");
  });
  it("con decimales: una coma y un solo decimal", () => {
    expect(escribir("36,85", temp)).toBe("36,8");
    expect(escribir(",36", temp)).toBe("36");
    expect(escribir("36,,8", temp)).toBe("36,8");
  });
  it("aNumero", () => {
    expect(aNumero("36,8")).toBe(36.8);
    expect(aNumero("135")).toBe(135);
    expect(aNumero("36,")).toBeNull();
    expect(aNumero("")).toBeNull();
  });
});
