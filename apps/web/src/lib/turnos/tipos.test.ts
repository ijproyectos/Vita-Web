import { describe, expect, it } from "vitest";
import { textoLlevarAviso } from "./tipos";

const item = (t: string, ok = false) => ({ t, ok });

describe("textoLlevarAviso", () => {
  it("sin nada para llevar no agrega texto", () => {
    expect(textoLlevarAviso([])).toBeNull();
    expect(textoLlevarAviso(null)).toBeNull();
    expect(textoLlevarAviso([item("DNI", true)])).toBeNull();
  });
  it("une los pendientes sin repetir lo ya tildado", () => {
    expect(textoLlevarAviso([item("DNI")])).toBe("Llevá: DNI");
    expect(textoLlevarAviso([item("DNI"), item("Orden", true), item("Credencial")])).toBe("Llevá: DNI y Credencial");
  });
  it("corta a tres para no alargar el aviso", () => {
    expect(textoLlevarAviso(["A", "B", "C", "D", "E"].map((t) => item(t)))).toBe("Llevá: A, B, C y 2 más");
  });
});
