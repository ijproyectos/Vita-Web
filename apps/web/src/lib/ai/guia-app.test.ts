import { describe, expect, it } from "vitest";
import { CLAVES_PANTALLAS, guiaDePantallasParaPrompt, pantallaPorClave, PANTALLAS } from "./guia-app";

describe("pantallaPorClave", () => {
  it("devuelve la pantalla de una clave válida", () => {
    expect(pantallaPorClave("rutina")).toEqual(PANTALLAS.rutina);
  });
  it("rechaza claves desconocidas y entradas que no son string", () => {
    expect(pantallaPorClave("no_existe")).toBeNull();
    expect(pantallaPorClave(undefined)).toBeNull();
    expect(pantallaPorClave(42)).toBeNull();
    expect(pantallaPorClave({})).toBeNull();
  });
  it("no resuelve claves heredadas del prototipo", () => {
    expect(pantallaPorClave("__proto__")).toBeNull();
    expect(pantallaPorClave("constructor")).toBeNull();
    expect(pantallaPorClave("toString")).toBeNull();
  });
  it("toda ruta del catálogo es interna a /app", () => {
    for (const c of CLAVES_PANTALLAS) expect(PANTALLAS[c].ruta.startsWith("/app")).toBe(true);
  });
});

describe("guiaDePantallasParaPrompt", () => {
  it("lista una línea por pantalla con su clave", () => {
    const lineas = guiaDePantallasParaPrompt().split("\n");
    expect(lineas).toHaveLength(CLAVES_PANTALLAS.length);
    expect(lineas[0]).toMatch(/^- inicio: Inicio — /);
  });
});
