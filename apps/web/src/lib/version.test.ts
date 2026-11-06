import { describe, expect, it } from "vitest";
import { formatoFechaBuild, textoBuild } from "./version";
import { buildDeRespuesta, hayVersionNueva, type EstadoAviso } from "./version-nueva";

const base: EstadoAviso = { buildActual: "abc1234", buildServidor: "def5678", descartado: null, enLinea: true, visible: true };

describe("formato de versión", () => {
  it("formatea la fecha en hora argentina", () => {
    expect(formatoFechaBuild("2026-11-06T15:00:00.000Z")).toBe("6 nov 2026");
    expect(formatoFechaBuild("2026-11-07T01:00:00.000Z")).toBe("6 nov 2026");
  });
  it("fecha inválida o vacía", () => {
    expect(formatoFechaBuild("")).toBe("");
    expect(formatoFechaBuild("basura")).toBe("");
  });
  it("texto de build", () => {
    expect(textoBuild("abc1234", "2026-11-06T15:00:00Z")).toBe("build abc1234 · 6 nov 2026");
    expect(textoBuild("dev", "")).toBe("build dev");
  });
});

describe("hayVersionNueva", () => {
  it("build distinto: avisa", () => expect(hayVersionNueva(base)).toBe(true));
  it("mismo build: no avisa", () => expect(hayVersionNueva({ ...base, buildServidor: "abc1234" })).toBe(false));
  it("descartado ese build: no avisa", () => expect(hayVersionNueva({ ...base, descartado: "def5678" })).toBe(false));
  it("descartado uno viejo y sale otro: avisa", () => expect(hayVersionNueva({ ...base, descartado: "zzz0000" })).toBe(true));
  it("sin conexión u oculta: no avisa", () => {
    expect(hayVersionNueva({ ...base, enLinea: false })).toBe(false);
    expect(hayVersionNueva({ ...base, visible: false })).toBe(false);
  });
  it("sin respuesta del servidor o build dev: no avisa", () => {
    expect(hayVersionNueva({ ...base, buildServidor: null })).toBe(false);
    expect(hayVersionNueva({ ...base, buildActual: "dev" })).toBe(false);
  });
});

describe("buildDeRespuesta", () => {
  it("lee el build", () => expect(buildDeRespuesta({ build: "abc" })).toBe("abc"));
  it("rechaza formas raras", () => {
    expect(buildDeRespuesta(null)).toBeNull();
    expect(buildDeRespuesta({ build: 3 })).toBeNull();
    expect(buildDeRespuesta({ build: "" })).toBeNull();
  });
});
