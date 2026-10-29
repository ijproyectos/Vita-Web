import { describe, expect, it } from "vitest";
import {
  INSTRUCCIONES_ESTILO_SIMPLE,
  TOOLS_PERMITIDAS_SIMPLE,
  TOOLS_SOLO_SIMPLE,
  leerModoChat,
  toolPermitida,
  toolsParaModo,
} from "./modo-simple";
import { TOOLS } from "./tools-definiciones";

describe("leerModoChat", () => {
  it("solo 'simple' activa el modo simple", () => {
    expect(leerModoChat("simple")).toBe("simple");
    for (const v of [undefined, null, "normal", "SIMPLE", 1, true, {}]) expect(leerModoChat(v)).toBe("normal");
  });
});

describe("toolsParaModo", () => {
  it("en modo normal ofrece exactamente TOOLS, sin las dos nuevas", () => {
    const normal = toolsParaModo("normal");
    expect(normal).toBe(TOOLS);
    const nombres = normal.map((t) => t.name);
    for (const n of TOOLS_SOLO_SIMPLE) expect(nombres).not.toContain(n);
  });
  it("en modo simple ofrece exactamente la lista permitida", () => {
    const nombres = toolsParaModo("simple").map((t) => t.name).sort();
    expect(nombres).toEqual([...TOOLS_PERMITIDAS_SIMPLE].sort());
  });
  it("el modo simple no incluye escrituras de datos", () => {
    const nombres = toolsParaModo("simple").map((t) => t.name);
    for (const n of ["add_medication", "mark_taken", "mark_all_taken", "delete_schedule", "update_schedule", "update_health_profile"]) {
      expect(nombres).not.toContain(n);
    }
  });
});

describe("toolPermitida", () => {
  it("simple: solo la lista", () => {
    expect(toolPermitida("simple", "pedir_ayuda_familia")).toBe(true);
    expect(toolPermitida("simple", "proponer_medicion")).toBe(true);
    expect(toolPermitida("simple", "list_today_medications")).toBe(true);
    expect(toolPermitida("simple", "add_medication")).toBe(false);
    expect(toolPermitida("simple", "inventada")).toBe(false);
  });
  it("normal: las dos nuevas no se ejecutan, el resto sigue igual", () => {
    expect(toolPermitida("normal", "pedir_ayuda_familia")).toBe(false);
    expect(toolPermitida("normal", "proponer_medicion")).toBe(false);
    expect(toolPermitida("normal", "add_medication")).toBe(true);
    expect(toolPermitida("normal", "set_avatar_mood")).toBe(true);
  });
});

describe("INSTRUCCIONES_ESTILO_SIMPLE", () => {
  it("menciona las dos tools y la regla de no afirmar de más", () => {
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("pedir_ayuda_familia");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("proponer_medicion");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("SOLO si el resultado");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("NO digas que quedó anotado");
  });
});
