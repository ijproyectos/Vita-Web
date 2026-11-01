import { describe, expect, it } from "vitest";
import { CUERPO_PUSH_MAX, PUSH_MAX_POR_HORA, superaLimitePush, TITULO_PUSH_MAX, validarMensajePush } from "./push-form";

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
    expect(superaLimitePush(9)).toBe(false);
    expect(superaLimitePush(10)).toBe(true);
  });
});
