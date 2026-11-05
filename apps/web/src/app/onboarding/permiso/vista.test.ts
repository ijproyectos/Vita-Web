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
  it("invitado trabado: deja continuar si el estado no resuelve o el intento no termina", () => {
    expect(accionPermiso("cargando", false, true, true)).toBe("continuar-sin-avisos");
    expect(accionPermiso("inactivo", false, true, true, true)).toBe("continuar-sin-avisos");
  });
  it("invitado leyendo la pantalla: vencida la espera sigue ofreciendo permitir", () => {
    expect(accionPermiso("inactivo", false, true, true)).toBe("permitir");
  });
  it("invitado con el intento en curso: antes de vencer la espera no muestra la salida", () => {
    expect(accionPermiso("inactivo", false, true, false, true)).toBe("permitir");
  });
  it("trabado sin invitación no cambia nada", () => {
    expect(accionPermiso("cargando", false, false, true)).toBe("permitir");
    expect(accionPermiso("inactivo", true, false, true)).toBe("permitir");
  });
  it("si el estado se resuelve, gana el estado final", () => {
    expect(accionPermiso("activo", false, true, true)).toBe("continuar");
    expect(accionPermiso("bloqueado", false, true, true)).toBe("continuar");
  });
});
