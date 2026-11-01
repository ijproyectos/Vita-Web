import { describe, expect, it } from "vitest";
import { clavePush, CUERPO_PUSH_MAX, inicioVentanaPush, PUSH_MAX_POR_HORA, superaLimitePush, TITULO_PUSH_MAX, validarMensajePush } from "./push-form";

describe("validarMensajePush", () => {
  it("recorta espacios y acepta en el límite", () => {
    const r = validarMensajePush({ titulo: `  ${"a".repeat(TITULO_PUSH_MAX)} `, cuerpo: "b".repeat(CUERPO_PUSH_MAX) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mensaje.titulo).toHaveLength(TITULO_PUSH_MAX);
  });
  it("rechaza vacíos y excesos", () => {
    expect(validarMensajePush({ titulo: "  ", cuerpo: "x" }).ok).toBe(false);
    expect(validarMensajePush({ titulo: "x", cuerpo: "" }).ok).toBe(false);
    expect(validarMensajePush({ titulo: "a".repeat(TITULO_PUSH_MAX + 1), cuerpo: "x" }).ok).toBe(false);
    expect(validarMensajePush({ titulo: "x", cuerpo: "b".repeat(CUERPO_PUSH_MAX + 1) }).ok).toBe(false);
  });
  it("rechaza tipos que no son texto", () => {
    expect(validarMensajePush({ titulo: 5, cuerpo: null }).ok).toBe(false);
    expect(validarMensajePush({ titulo: undefined, cuerpo: undefined }).ok).toBe(false);
  });
});

describe("límite por hora", () => {
  it("10 por hora", () => {
    expect(PUSH_MAX_POR_HORA).toBe(10);
    expect(superaLimitePush(10)).toBe(false); // el décimo todavía pasa
    expect(superaLimitePush(11)).toBe(true);
    expect(inicioVentanaPush(Date.UTC(2026, 10, 1, 15, 59, 59)).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(clavePush(" Ana@Example.com ")).toBe("admin-push:ana@example.com:hora");
  });
});
