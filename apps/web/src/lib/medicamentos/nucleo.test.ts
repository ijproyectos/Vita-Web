import { describe, expect, it, vi } from "vitest";

// `nucleo.ts` importa `server-only` (que lanza fuera de un Server Component) y
// el núcleo de inventario; solo se prueban las funciones puras de hora, así que
// se anulan esas dependencias.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inventario/nucleo", () => ({ ajustarStock: vi.fn(), buscarInventarioId: vi.fn() }));

const { esDosisVencida, horaEnAR, fechaEnAR } = await import("./nucleo");

describe("esDosisVencida", () => {
  it("antes de la hora no está vencida", () => {
    expect(esDosisVencida("08:00", "07:59", 0)).toBe(false);
  });
  it("justo a la hora, con gracia 0, está vencida", () => {
    expect(esDosisVencida("08:00", "08:00", 0)).toBe(true);
  });
  it("respeta el margen de gracia (límite inclusivo)", () => {
    expect(esDosisVencida("08:00", "08:29", 30)).toBe(false);
    expect(esDosisVencida("08:00", "08:30", 30)).toBe(true);
  });
  it("cruza la hora en punto", () => {
    expect(esDosisVencida("08:50", "09:10", 20)).toBe(true);
    expect(esDosisVencida("08:50", "09:09", 20)).toBe(false);
  });
  // Bug conocido: no contempla pasar medianoche. it.fails falla el día que se arregle: pasarlo a it.
  it.fails("una dosis de las 23:50 está vencida a las 00:10", () => {
    expect(esDosisVencida("23:50", "00:10", 0)).toBe(true);
  });
});

describe("horaEnAR / fechaEnAR (independientes del TZ del equipo)", () => {
  it("convierte UTC a hora de pared argentina (UTC-3)", () => {
    expect(horaEnAR(new Date("2026-10-10T11:05:00Z"))).toBe("08:05");
    expect(horaEnAR(new Date("2026-10-10T23:59:00Z"))).toBe("20:59");
  });
  it("medianoche AR", () => {
    expect(horaEnAR(new Date("2026-10-10T03:00:00Z"))).toBe("00:00");
    expect(horaEnAR(new Date("2026-10-10T02:59:00Z"))).toBe("23:59");
  });
  it("fechaEnAR usa el día argentino", () => {
    expect(fechaEnAR(new Date("2026-10-11T02:59:00Z"))).toBe("2026-10-10");
    expect(fechaEnAR(new Date("2026-10-11T03:00:00Z"))).toBe("2026-10-11");
  });
  it("horaEnAR alimenta esDosisVencida", () => {
    const ahora = horaEnAR(new Date("2026-10-10T12:00:00Z")); // 09:00 AR
    expect(esDosisVencida("08:30", ahora, 30)).toBe(true);
    expect(esDosisVencida("08:30", ahora, 31)).toBe(false);
  });
});
