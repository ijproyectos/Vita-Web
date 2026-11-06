import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERVALO_REFRESCO_MS, programarRefresco } from "./refresco";

function entorno() {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win = new EventTarget();
  const nav = { onLine: true };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", nav);
  return { doc, win, nav };
}

describe("programarRefresco", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refresca en cada vuelta con la app visible y conectada", () => {
    entorno();
    const refrescar = vi.fn();
    programarRefresco(refrescar);
    expect(refrescar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INTERVALO_REFRESCO_MS * 2);
    expect(refrescar).toHaveBeenCalledTimes(2);
  });

  it("no intenta sin conexión y refresca apenas vuelve", () => {
    const { win, nav } = entorno();
    const refrescar = vi.fn();
    programarRefresco(refrescar);
    nav.onLine = false;
    vi.advanceTimersByTime(INTERVALO_REFRESCO_MS);
    expect(refrescar).not.toHaveBeenCalled();
    nav.onLine = true;
    win.dispatchEvent(new Event("online"));
    expect(refrescar).toHaveBeenCalledTimes(1);
  });

  it("no intenta en segundo plano y refresca al volver al frente", () => {
    const { doc } = entorno();
    const refrescar = vi.fn();
    programarRefresco(refrescar);
    doc.visibilityState = "hidden";
    vi.advanceTimersByTime(INTERVALO_REFRESCO_MS);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refrescar).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refrescar).toHaveBeenCalledTimes(1);
  });

  it("al detenerlo deja de refrescar por cualquier vía", () => {
    const { doc, win } = entorno();
    const refrescar = vi.fn();
    programarRefresco(refrescar)();
    vi.advanceTimersByTime(INTERVALO_REFRESCO_MS);
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("online"));
    expect(refrescar).not.toHaveBeenCalled();
  });
});
