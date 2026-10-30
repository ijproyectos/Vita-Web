import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TOOLS } from "./tools";
import { contextoResumen } from "@/lib/memoria/resumen-logica";
import { SYSTEM_PROMPT, armarSystemChat, contextoDinamicoChat } from "./prompt-chat";

const ctx = (n: number) =>
  contextoDinamicoChat({
    contextoPerfil: `\n\nPersonas:\n- Vos — persona_id: user-${n}`,
    contextoHoy: `\n\nHoy: medicamento-${n} 0${n}:00 (pendiente)`,
    ahora: `lunes ${n} de octubre de 2026, 1${n}:3${n}`,
    hoyISO: `2026-10-0${n}`,
  });

// Lo que la API cachea: tools + system hasta el último bloque con cache_control (inclusive).
function prefijoCacheado(dinamico: string): string {
  const system = armarSystemChat(dinamico);
  const ultimo = system.map((b) => !!b.cache_control).lastIndexOf(true);
  return JSON.stringify({ tools: TOOLS, system: system.slice(0, ultimo + 1) });
}

describe("prompt caching del chat", () => {
  it("el prefijo cacheado es byte-idéntico con distinta fecha, usuario y contexto", () => {
    expect(prefijoCacheado(ctx(1))).toBe(prefijoCacheado(ctx(2)));
  });
  it("lo volátil queda después del breakpoint y sin cache_control", () => {
    const system = armarSystemChat(ctx(3));
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].cache_control).toBeUndefined();
    expect(system[1].text).toContain("user-3");
    expect(system[1].text).toContain("2026-10-03");
    expect(prefijoCacheado(ctx(3))).not.toContain("user-3");
    expect(prefijoCacheado(ctx(3))).not.toContain("2026-10-03");
  });
  it("el bloque estático no tiene fechas, ids ni datos por request", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(SYSTEM_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(SYSTEM_PROMPT).not.toMatch(/ahora es /);
  });
  it("las tools se serializan igual en cada render y sin duplicados", () => {
    expect(JSON.stringify(TOOLS)).toBe(JSON.stringify(TOOLS));
    const nombres = TOOLS.map((t) => t.name);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
  it("el prefijo supera el mínimo cacheable de Sonnet 5 (1024 tokens)", () => {
    // ~4 caracteres por token en español: con holgura, el prefijo es mucho mayor que 1024 tokens.
    expect(prefijoCacheado(ctx(1)).length / 4).toBeGreaterThan(1024);
  });
  it("las tools de memoria van al final y no aceptan persona_id", () => {
    const nombres = TOOLS.map((t) => t.name);
    expect(nombres.slice(-3)).toEqual(["recordar", "buscar_memoria", "resolver_contradiccion"]);
    for (const n of ["recordar", "buscar_memoria", "resolver_contradiccion"]) {
      const props = (TOOLS.find((t) => t.name === n)!.input_schema as { properties: Record<string, unknown> }).properties;
      expect(props).not.toHaveProperty("persona_id");
      expect(props).not.toHaveProperty("confirmado");
    }
  });
  it("las reglas de memoria son estáticas; los recuerdos y el estado por persona van en el bloque dinámico", () => {
    expect(SYSTEM_PROMPT).toContain("buscar_memoria");
    const conRecuerdos = contextoDinamicoChat({
      contextoPerfil: "",
      contextoHoy: "",
      contextoMemoria: "\n\nSobre quien te habla:\n- [dia_visita] Laura viene los jueves",
      ahora: "lunes 1 de octubre de 2026, 10:00",
      hoyISO: "2026-10-01",
    });
    const sinRecuerdos = contextoDinamicoChat({ contextoPerfil: "", contextoHoy: "", ahora: "lunes 1 de octubre de 2026, 10:00", hoyISO: "2026-10-01" });
    expect(conRecuerdos).toContain("Laura viene los jueves");
    expect(sinRecuerdos).not.toContain("Laura");
    // El prefijo cacheado es idéntico con o sin recuerdos y con la memoria apagada.
    expect(prefijoCacheado(conRecuerdos)).toBe(prefijoCacheado(sinRecuerdos));
    expect(prefijoCacheado(conRecuerdos)).not.toContain("Laura viene los jueves");
    expect(armarSystemChat(conRecuerdos)[1].text).toContain("Laura viene los jueves");
  });
  it("el orden de las tools es fijo: cambiarlo invalida el caché, así que tiene que ser a propósito", () => {
    expect(TOOLS.map((t) => t.name)).toMatchInlineSnapshot(`
      [
        "list_today_medications",
        "list_all_medications",
        "add_medication",
        "update_schedule",
        "delete_schedule",
        "mark_taken",
        "mark_all_taken",
        "add_appointment",
        "list_today_appointments",
        "update_health_profile",
        "add_condition",
        "add_allergy",
        "show_today_medications",
        "show_all_medications",
        "open_screen",
        "set_avatar_mood",
        "recordar",
        "buscar_memoria",
        "resolver_contradiccion",
      ]
    `);
  });
  it("el resumen de charlas va solo en el bloque dinámico, nunca en el estático ni en las tools", () => {
    const resumen = contextoResumen({ resumen: "Charlaron sobre el sueño de la persona.", pendientes: ["retomar lo del sueño"] });
    const dinamico = contextoDinamicoChat({
      contextoPerfil: "",
      contextoHoy: "",
      contextoMemoria: resumen,
      ahora: "lunes 1 de octubre de 2026, 10:00",
      hoyISO: "2026-10-01",
    });
    const system = armarSystemChat(dinamico);
    expect(system[1].text).toContain("Charlaron sobre el sueño");
    expect(system[0].text).not.toContain("Charlaron sobre el sueño");
    expect(system[0].text).not.toContain("Resumen de charlas anteriores");
    expect(JSON.stringify(TOOLS)).not.toContain("Charlaron sobre el sueño");
    expect(SYSTEM_PROMPT).not.toContain("Resumen de charlas anteriores");
  });
});
