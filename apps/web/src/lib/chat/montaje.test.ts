import { describe, expect, it, vi } from "vitest";
import { cuandoOcioso, debeMontarOverlay } from "./montaje";

describe("debeMontarOverlay", () => {
  it("no monta hasta que haya un motivo", () => {
    expect(debeMontarOverlay({ yaMontado: false, abierto: false, ociosoListo: false })).toBe(false);
  });
  it("monta al abrirse aunque el ocio no haya llegado (el abrir queda en cola en el proveedor)", () => {
    expect(debeMontarOverlay({ yaMontado: false, abierto: true, ociosoListo: false })).toBe(true);
  });
  it("monta cuando el navegador queda ocioso", () => {
    expect(debeMontarOverlay({ yaMontado: false, abierto: false, ociosoListo: true })).toBe(true);
  });
  it("una vez montado no se desmonta al cerrarse (se conserva la conversacion)", () => {
    expect(debeMontarOverlay({ yaMontado: true, abierto: false, ociosoListo: false })).toBe(true);
  });
});

describe("cuandoOcioso", () => {
  it("usa requestIdleCallback con el plazo cuando existe y permite cancelar", () => {
    const requestIdleCallback = vi.fn(() => 7);
    const cancelIdleCallback = vi.fn();
    const cancelar = cuandoOcioso(() => {}, 4000, { requestIdleCallback, cancelIdleCallback, setTimeout, clearTimeout });
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 });
    cancelar();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
  it("cae a setTimeout (con tope de 2 s) cuando no hay requestIdleCallback", () => {
    const fakeSetTimeout = vi.fn(() => 3 as unknown as ReturnType<typeof setTimeout>) as unknown as typeof setTimeout;
    const fakeClear = vi.fn() as unknown as typeof clearTimeout;
    const cancelar = cuandoOcioso(() => {}, 4000, { setTimeout: fakeSetTimeout, clearTimeout: fakeClear });
    expect(fakeSetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
    cancelar();
    expect(fakeClear).toHaveBeenCalled();
  });
});
