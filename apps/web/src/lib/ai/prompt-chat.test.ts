import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TOOLS } from "./tools";
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
});
