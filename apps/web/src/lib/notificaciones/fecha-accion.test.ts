import { describe, expect, it, vi } from "vitest";

// `nucleo.ts` imports `server-only` and the inventory core; only pure date helpers are used.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inventario/nucleo", () => ({ ajustarStock: vi.fn(), buscarInventarioId: vi.fn() }));

const { validarFechaAccion } = await import("./fecha-accion");

// 2026-10-28 12:00 AR (UTC-3) and 2026-10-29 00:10 AR / 00:45 AR.
const MEDIODIA = new Date("2026-10-28T15:00:00Z");
const PASADA_MEDIANOCHE = new Date("2026-10-29T03:10:00Z");
const FUERA_DE_VENTANA = new Date("2026-10-29T03:45:00Z");

describe("validarFechaAccion", () => {
  it("accepts today's date for both actions", () => {
    expect(validarFechaAccion("tomada", "2026-10-28", MEDIODIA)).toEqual({ ok: true, fecha: "2026-10-28" });
    expect(validarFechaAccion("posponer", "2026-10-28", MEDIODIA)).toEqual({ ok: true, fecha: "2026-10-28" });
  });
  it("refuses a missing or null date (stale service workers never mark today's dose)", () => {
    for (const fecha of [undefined, null]) {
      expect(validarFechaAccion("tomada", fecha, MEDIODIA)).toEqual({ ok: false, motivo: "sin_fecha" });
      expect(validarFechaAccion("posponer", fecha, MEDIODIA)).toEqual({ ok: false, motivo: "sin_fecha" });
    }
  });
  it("refuses a malformed date", () => {
    expect(validarFechaAccion("tomada", "ayer", MEDIODIA)).toEqual({ ok: false, motivo: "sin_fecha" });
  });
  it("refuses yesterday's dose once the post-midnight window is over", () => {
    expect(validarFechaAccion("tomada", "2026-10-28", FUERA_DE_VENTANA)).toEqual({ ok: false, motivo: "vencida" });
  });
  it("accepts yesterday's dose inside the window, marking that date", () => {
    expect(validarFechaAccion("tomada", "2026-10-28", PASADA_MEDIANOCHE)).toEqual({ ok: true, fecha: "2026-10-28" });
  });
  it("never postpones a dose from another day", () => {
    expect(validarFechaAccion("posponer", "2026-10-28", PASADA_MEDIANOCHE)).toEqual({ ok: false, motivo: "vencida" });
  });
  it("refuses future or arbitrary dates", () => {
    expect(validarFechaAccion("tomada", "2026-10-30", MEDIODIA)).toEqual({ ok: false, motivo: "vencida" });
  });
});
