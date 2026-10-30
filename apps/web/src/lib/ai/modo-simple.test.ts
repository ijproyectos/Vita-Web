import { describe, expect, it } from "vitest";
import {
  INSTRUCCIONES_ESTILO_SIMPLE,
  TOOLS_PERMITIDAS_SIMPLE,
  TEXTO_SUGERIR_LLAMAR_AYUDA,
  TOOLS_SOLO_SIMPLE,
  RESULTADO_TOOL_NO_DISPONIBLE,
  contextoDinamicoParaModo,
  leerModoChat,
  resultadoToolBloqueada,
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
    expect(toolPermitida("simple", "sugerir_llamar_ayuda")).toBe(true);
    expect(toolPermitida("simple", "proponer_medicion")).toBe(true);
    expect(toolPermitida("simple", "list_today_medications")).toBe(true);
    expect(toolPermitida("simple", "add_medication")).toBe(false);
    expect(toolPermitida("simple", "inventada")).toBe(false);
  });
  it("normal: las dos nuevas no se ejecutan, el resto sigue igual", () => {
    expect(toolPermitida("normal", "sugerir_llamar_ayuda")).toBe(false);
    expect(toolPermitida("normal", "proponer_medicion")).toBe(false);
    expect(toolPermitida("normal", "add_medication")).toBe(true);
    expect(toolPermitida("normal", "set_avatar_mood")).toBe(true);
  });
});

describe("INSTRUCCIONES_ESTILO_SIMPLE", () => {
  it("menciona las dos tools y la regla de no afirmar de más", () => {
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("sugerir_llamar_ayuda");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).not.toContain("pedir_ayuda_familia");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("proponer_medicion");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("Nunca digas que avisaste");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("NO digas que quedó anotado");
  });
});

describe("ayuda sin notificar", () => {
  it("el modo simple ofrece sugerir_llamar_ayuda y no pedir_ayuda_familia", () => {
    const nombres = toolsParaModo("simple").map((t) => t.name);
    expect(nombres).toContain("sugerir_llamar_ayuda");
    expect(nombres).not.toContain("pedir_ayuda_familia");
    expect(toolPermitida("simple", "pedir_ayuda_familia")).toBe(false);
  });
  it("el resultado para el modelo manda a llamar, nombra el 107 y no dice que se avisó", () => {
    expect(TEXTO_SUGERIR_LLAMAR_AYUDA).toContain("107");
    expect(TEXTO_SUGERIR_LLAMAR_AYUDA).toContain("No se envió ningún aviso");
    expect(TEXTO_SUGERIR_LLAMAR_AYUDA).toContain("NUNCA digas que avisaste");
    expect(TEXTO_SUGERIR_LLAMAR_AYUDA).not.toMatch(/avisé|les avisé/);
  });
});

describe("resultadoToolBloqueada (lo que /api/chat devuelve por cada uso de tool)", () => {
  it("simple: una escritura que el modelo nombre igual se rechaza sin ejecutarse", () => {
    expect(resultadoToolBloqueada("simple", { id: "tu_1", name: "add_medication" })).toEqual({
      type: "tool_result",
      tool_use_id: "tu_1",
      content: RESULTADO_TOOL_NO_DISPONIBLE,
      is_error: true,
    });
  });

  it("simple: las permitidas pasan", () => {
    for (const nombre of TOOLS_PERMITIDAS_SIMPLE) expect(resultadoToolBloqueada("simple", { id: "x", name: nombre })).toBeNull();
  });

  it("normal: las tools solo-simple se rechazan y las de siempre pasan", () => {
    for (const nombre of TOOLS_SOLO_SIMPLE) expect(resultadoToolBloqueada("normal", { id: "x", name: nombre })?.is_error).toBe(true);
    for (const t of TOOLS) expect(resultadoToolBloqueada("normal", { id: "x", name: t.name })).toBeNull();
  });
});

describe("contextoDinamicoParaModo", () => {
  it("simple suma el estilo al final del bloque dinámico", () => {
    expect(contextoDinamicoParaModo("simple", "HOY")).toBe(`HOY${INSTRUCCIONES_ESTILO_SIMPLE}`);
  });

  it("normal deja el bloque intacto", () => {
    expect(contextoDinamicoParaModo("normal", "HOY")).toBe("HOY");
  });
});

describe("memoria de vita en modo simple", () => {
  const MEMORIA = ["recordar", "buscar_memoria"];
  it("existen en TOOLS (modo normal)", () => {
    const nombres = toolsParaModo("normal").map((t) => t.name);
    for (const n of MEMORIA) expect(nombres).toContain(n);
  });
  it("no se ofrecen en modo simple", () => {
    const nombres = toolsParaModo("simple").map((t) => t.name);
    for (const n of MEMORIA) expect(nombres).not.toContain(n);
    for (const n of MEMORIA) expect(TOOLS_PERMITIDAS_SIMPLE.has(n)).toBe(false);
  });
  it("si el modelo las nombra igual en modo simple, resultadoToolBloqueada las rechaza", () => {
    for (const n of MEMORIA) {
      expect(toolPermitida("simple", n)).toBe(false);
      expect(resultadoToolBloqueada("simple", { id: "t1", name: n })).toMatchObject({ is_error: true, content: RESULTADO_TOOL_NO_DISPONIBLE });
      expect(resultadoToolBloqueada("normal", { id: "t1", name: n })).toBeNull();
    }
  });
  it("el estilo simple le dice al modelo que no las tiene", () => {
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("recordar");
    expect(INSTRUCCIONES_ESTILO_SIMPLE).toContain("buscar_memoria");
  });
});
