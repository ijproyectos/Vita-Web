import { describe, expect, it } from "vitest";
import { contextoDinamicoParaModo, INSTRUCCIONES_ESTILO_SIMPLE } from "./modo-simple";
import { INSTRUCCIONES_ESTILO_JARVIS, leerPersona } from "./persona-jarvis";

describe("persona jarvis", () => {
  it("solo 'jarvis' activa la persona", () => {
    expect(leerPersona("jarvis")).toBe("jarvis");
    expect(leerPersona("otra")).toBe("vita");
    expect(leerPersona(undefined)).toBe("vita");
  });

  it("en modo simple reemplaza el estilo de persona mayor por el de jarvis", () => {
    const ctx = contextoDinamicoParaModo("simple", "base", "jarvis");
    expect(ctx).toContain(INSTRUCCIONES_ESTILO_JARVIS);
    expect(ctx).not.toContain(INSTRUCCIONES_ESTILO_SIMPLE);
  });

  it("sin persona el modo simple queda igual y el normal no cambia", () => {
    expect(contextoDinamicoParaModo("simple", "base")).toBe(`base${INSTRUCCIONES_ESTILO_SIMPLE}`);
    expect(contextoDinamicoParaModo("normal", "base", "jarvis")).toBe("base");
  });
});
