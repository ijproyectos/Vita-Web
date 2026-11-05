import { describe, expect, it } from "vitest";
import { accionPermiso } from "./vista";

describe("accionPermiso", () => {
  it("sin invitación nunca cambia el botón", () => {
    expect(accionPermiso("inactivo", true, false)).toBe("permitir");
    expect(accionPermiso("inactivo", false, false)).toBe("permitir");
  });
  it("invitado: antes de intentar ofrece permitir", () => {
    expect(accionPermiso("inactivo", false, true)).toBe("permitir");
  });
  it("invitado: tras intentar y seguir inactivo, deja continuar", () => {
    expect(accionPermiso("inactivo", true, true)).toBe("continuar-sin-avisos");
  });
  it("estados finales siempre continúan", () => {
    for (const e of ["activo", "bloqueado", "no-soportado", "ios-instalar"] as const) expect(accionPermiso(e, true, true)).toBe("continuar");
  });
});
