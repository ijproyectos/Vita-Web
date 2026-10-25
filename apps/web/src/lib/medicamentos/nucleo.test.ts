import { describe, expect, it, vi } from "vitest";
import type { DiaSemana } from "./tipos";

// `nucleo.ts` importa `server-only` (que lanza fuera de un Server Component) y
// el núcleo de inventario; solo se prueban las funciones puras de hora, así que
// se anulan esas dependencias.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inventario/nucleo", () => ({ ajustarStock: vi.fn(), buscarInventarioId: vi.fn() }));

const {
  esDosisVencida,
  esDosisDeAyerVencida,
  fechaEnAR,
  fechaAyerEnAR,
  filtrarDosisDeAyerVencidas,
  horaEnAR,
  FIN_VENTANA_MEDIANOCHE,
} = await import("./nucleo");

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
  // `esDosisVencida` compara minutos del MISMO día; cruzar la medianoche lo
  // resuelve `esDosisDeAyerVencida` (ventana hasta 00:30), no esta función.
  it("no cruza la medianoche por sí sola: la dosis de ayer es de esDosisDeAyerVencida", () => {
    expect(esDosisVencida("23:50", "00:10", 0)).toBe(false);
  });
});

describe("esDosisDeAyerVencida (ventana de medianoche)", () => {
  it("la ventana termina a las 00:30", () => {
    expect(FIN_VENTANA_MEDIANOCHE).toBe("00:30");
  });
  it("una dosis de las 23:50 sin tomar sigue vencida a las 00:10", () => {
    expect(esDosisDeAyerVencida("23:50", "00:10", 0)).toBe(true);
  });
  it("a las 00:29 todavía cuenta, a las 00:30 ya no", () => {
    expect(esDosisDeAyerVencida("23:50", "00:29", 0)).toBe(true);
    expect(esDosisDeAyerVencida("23:50", "00:30", 0)).toBe(false);
    expect(esDosisDeAyerVencida("23:50", "12:00", 0)).toBe(false);
  });
  it("respeta la gracia cruzando la medianoche", () => {
    // 23:50 -> 00:10 son 20 minutos
    expect(esDosisDeAyerVencida("23:50", "00:10", 20)).toBe(true);
    expect(esDosisDeAyerVencida("23:50", "00:09", 20)).toBe(false);
    expect(esDosisDeAyerVencida("23:30", "00:05", 30)).toBe(true);
    expect(esDosisDeAyerVencida("23:50", "00:05", 30)).toBe(false);
  });
  it("una dosis de ayer más temprano también cuenta dentro de la ventana", () => {
    expect(esDosisDeAyerVencida("08:00", "00:10", 30)).toBe(true);
  });
  it("a las 08:00 nunca marca la de las 23:50 (la de HOY es futura)", () => {
    expect(esDosisDeAyerVencida("23:50", "08:00", 0)).toBe(false);
    expect(esDosisVencida("23:50", "08:00", 0)).toBe(false);
  });
});

describe("fechaAyerEnAR", () => {
  it("devuelve el día argentino anterior", () => {
    // 00:10 AR del 11/10
    expect(fechaAyerEnAR(new Date("2026-10-11T03:10:00Z"))).toBe("2026-10-10");
    // 23:59 AR del 10/10
    expect(fechaAyerEnAR(new Date("2026-10-11T02:59:00Z"))).toBe("2026-10-09");
  });
  it("cruza el fin de mes y de año", () => {
    expect(fechaAyerEnAR(new Date("2026-11-01T03:10:00Z"))).toBe("2026-10-31");
    expect(fechaAyerEnAR(new Date("2027-01-01T03:10:00Z"))).toBe("2026-12-31");
  });
});

describe("filtrarDosisDeAyerVencidas", () => {
  const med = (id: string, hora: string, dias: DiaSemana[] = []) => ({ id, hora_programada: hora, dias_recurrentes: dias });
  // 00:10 AR del domingo 11/10/2026 (ayer: sábado)
  const ahora = new Date("2026-10-11T03:10:00Z");

  it("devuelve las no tomadas dentro de la ventana", () => {
    const r = filtrarDosisDeAyerVencidas([med("a", "23:50"), med("b", "23:30")], new Set(["b"]), ahora, 0);
    expect(r.map((m) => m.id)).toEqual(["a"]);
  });
  it("respeta dias_recurrentes del día de AYER", () => {
    const r = filtrarDosisDeAyerVencidas(
      [med("sab", "23:50", ["sabado"]), med("dom", "23:50", ["domingo"])],
      new Set(),
      ahora,
      0
    );
    expect(r.map((m) => m.id)).toEqual(["sab"]);
  });
  it("respeta la gracia", () => {
    expect(filtrarDosisDeAyerVencidas([med("a", "23:50")], new Set(), ahora, 30)).toEqual([]);
  });
  it("fuera de la ventana no devuelve nada", () => {
    const tarde = new Date("2026-10-11T03:30:00Z"); // 00:30 AR
    expect(filtrarDosisDeAyerVencidas([med("a", "23:50")], new Set(), tarde, 0)).toEqual([]);
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
