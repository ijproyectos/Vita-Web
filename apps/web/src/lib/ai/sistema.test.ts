import { describe, expect, it, vi } from "vitest";
import { TOOLS } from "./tools";
import { construirSystem, SYSTEM_PROMPT } from "./sistema";

vi.mock("server-only", () => ({}));

describe("construirSystem", () => {
  const varA = "Personas: Ana (id-1)\nContexto: ahora es lunes 12:00 (hoy = 2026-10-26).";
  const varB = "Personas: Beto (id-2)\nContexto: ahora es martes 08:00 (hoy = 2026-10-27).";

  it("el bloque estático lleva cache_control y es idéntico entre usuarios y fechas", () => {
    const a = construirSystem(varA);
    const b = construirSystem(varB);
    expect(a[0]).toEqual(b[0]);
    expect(a[0]).toEqual({ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } });
  });
  it("el bloque variable no se cachea y contiene la fecha", () => {
    const [, variable] = construirSystem(varA);
    expect(variable.type).toBe("text");
    expect("cache_control" in variable).toBe(false);
    expect(variable.text).toContain("2026-10-26");
  });
  it("nada volátil se filtra al bloque estático", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(SYSTEM_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
  it("tools + bloque estático superan el mínimo cacheable (1024 tokens, estimado chars/4)", () => {
    const estimado = (JSON.stringify(TOOLS).length + SYSTEM_PROMPT.length) / 4;
    expect(estimado).toBeGreaterThan(1024);
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
      ]
    `);
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});
