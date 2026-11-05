import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accionPermiso, ESPERA_INTENTO_MS, pedirPermisoYSeguir } from "./vista";

describe("accionPermiso", () => {
  it("ofrece permitir mientras el sistema pueda preguntar", () => {
    expect(accionPermiso("inactivo", true)).toBe("permitir");
    expect(accionPermiso("inactivo", false)).toBe("permitir");
    expect(accionPermiso("cargando", true)).toBe("permitir");
  });
  it("ofrece continuar si el sistema no puede preguntar", () => {
    for (const e of ["activo", "bloqueado", "no-soportado", "ios-instalar"] as const) {
      expect(accionPermiso(e, true)).toBe("continuar");
      expect(accionPermiso(e, false)).toBe("continuar");
    }
  });
  it("con invitación, una carga trabada deja continuar", () => {
    expect(accionPermiso("cargando", true, true)).toBe("continuar");
  });
  it("leer la pantalla no quita el botón de permitir", () => {
    expect(accionPermiso("inactivo", true, true)).toBe("permitir");
  });
  it("sin invitación, la carga trabada no cambia nada", () => {
    expect(accionPermiso("cargando", false, true)).toBe("permitir");
  });
});

describe("pedirPermisoYSeguir", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("llama a activar de forma síncrona, dentro del toque", () => {
    const activar = vi.fn(() => new Promise<void>(() => undefined));
    void pedirPermisoYSeguir(activar, () => undefined);
    expect(activar).toHaveBeenCalledTimes(1);
  });

  it("sigue cuando el sistema responde o se cierra el diálogo", async () => {
    const seguir = vi.fn();
    await pedirPermisoYSeguir(() => Promise.resolve(), seguir);
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it("sigue aunque activar falle", async () => {
    const seguir = vi.fn();
    await pedirPermisoYSeguir(() => Promise.reject(new Error("falló")), seguir);
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it("si el sistema nunca responde, espera y sigue una sola vez", async () => {
    const seguir = vi.fn();
    const promesa = pedirPermisoYSeguir(() => new Promise<void>(() => undefined), seguir);
    await vi.advanceTimersByTimeAsync(ESPERA_INTENTO_MS - 1);
    expect(seguir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await promesa;
    expect(seguir).toHaveBeenCalledTimes(1);
  });
});
