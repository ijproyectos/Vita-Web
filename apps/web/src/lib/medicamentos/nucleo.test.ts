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
  fechaDeTomaEnAR,
  diasDeAdherencia,
  marcarTomado,
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

describe("fechaDeTomaEnAR (fecha con la que se graba una toma)", () => {
  // Instantes fijos: la salida no depende del TZ del equipo.
  const noche = new Date("2026-10-11T01:30:00Z"); // 22:30 AR del 10/10 (ya es 11/10 en UTC)
  const casiMedianoche = new Date("2026-10-11T02:59:00Z"); // 23:59 AR del 10/10
  const ventana = new Date("2026-10-11T03:10:00Z"); // 00:10 AR del 11/10
  const finVentana = new Date("2026-10-11T03:30:00Z"); // 00:30 AR del 11/10

  it("sin fecha de dosis usa el día AR de hoy, no el UTC (21:00-23:59 AR)", () => {
    expect(fechaDeTomaEnAR(noche)).toBe("2026-10-10");
    expect(fechaDeTomaEnAR(casiMedianoche)).toBe("2026-10-10");
    expect(fechaDeTomaEnAR(ventana)).toBe("2026-10-11");
  });
  it("acepta hoy AR explícito", () => {
    expect(fechaDeTomaEnAR(noche, "2026-10-10")).toBe("2026-10-10");
  });
  it("acepta ayer AR solo dentro de la ventana 00:00-00:29", () => {
    expect(fechaDeTomaEnAR(ventana, "2026-10-10")).toBe("2026-10-10");
    expect(fechaDeTomaEnAR(new Date("2026-10-11T03:00:00Z"), "2026-10-10")).toBe("2026-10-10");
    expect(fechaDeTomaEnAR(finVentana, "2026-10-10")).toBe("2026-10-11");
  });
  it("ayer fuera de la ventana cae a hoy", () => {
    expect(fechaDeTomaEnAR(new Date("2026-10-11T12:00:00Z"), "2026-10-10")).toBe("2026-10-11");
    expect(fechaDeTomaEnAR(noche, "2026-10-09")).toBe("2026-10-10");
  });
  it("rechaza fechas inválidas, futuras o más viejas que ayer", () => {
    expect(fechaDeTomaEnAR(ventana, "2026-10-09")).toBe("2026-10-11");
    expect(fechaDeTomaEnAR(ventana, "2026-10-12")).toBe("2026-10-11");
    expect(fechaDeTomaEnAR(ventana, "ayer")).toBe("2026-10-11");
    expect(fechaDeTomaEnAR(ventana, "2026-10-10T00:00:00Z")).toBe("2026-10-11");
    expect(fechaDeTomaEnAR(ventana, "")).toBe("2026-10-11");
  });
});

describe("diasDeAdherencia (claves por día AR)", () => {
  it("21:00-23:59 AR sigue en el día AR (no salta al de UTC)", () => {
    const r = diasDeAdherencia(new Date("2026-10-11T02:59:00Z"), 3); // 23:59 AR sábado 10/10
    expect(r).toEqual([
      { fecha: "2026-10-10", dia: "sabado" },
      { fecha: "2026-10-09", dia: "viernes" },
      { fecha: "2026-10-08", dia: "jueves" },
    ]);
  });
  it("00:10 AR ya es el día nuevo", () => {
    const r = diasDeAdherencia(new Date("2026-10-11T03:10:00Z"), 2);
    expect(r).toEqual([
      { fecha: "2026-10-11", dia: "domingo" },
      { fecha: "2026-10-10", dia: "sabado" },
    ]);
  });
});

describe("marcarTomado graba la fecha AR", () => {
  // Cliente falso: registra el upsert; el UPDATE no encuentra fila.
  function clienteFalso() {
    const upserts: Record<string, unknown>[] = [];
    const updates: { eq: [string, unknown][] } = { eq: [] };
    const cadena = (resultado: unknown) => {
      const c: Record<string, unknown> = {};
      c.update = () => c;
      c.eq = (col: string, val: unknown) => {
        updates.eq.push([col, val]);
        return c;
      };
      c.upsert = (fila: Record<string, unknown>) => {
        upserts.push(fila);
        return c;
      };
      c.select = () => Promise.resolve(resultado);
      c.maybeSingle = () => Promise.resolve({ data: null });
      return c;
    };
    const supabase = { from: () => cadena({ data: [], error: null }) };
    return { supabase: supabase as never, upserts, updates };
  }

  it("a las 22:30 AR escribe el día AR aunque UTC ya sea el siguiente", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T01:30:00Z"));
    try {
      const { supabase, upserts, updates } = clienteFalso();
      await marcarTomado(supabase, "u1", "m1", true);
      expect(upserts[0].fecha).toBe("2026-10-10");
      expect(updates.eq).toContainEqual(["fecha", "2026-10-10"]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("con la fecha de ayer dentro de la ventana escribe ayer", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-11T03:10:00Z"));
      const c = clienteFalso();
      await marcarTomado(c.supabase, "u1", "m1", true, "2026-10-10");
      expect(c.upserts[0].fecha).toBe("2026-10-10");
    } finally {
      vi.useRealTimers();
    }
  });
  it("con la fecha de ayer fuera de la ventana falla y no marca la de hoy", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
      const c = clienteFalso();
      await expect(marcarTomado(c.supabase, "u1", "m1", true, "2026-10-10")).rejects.toThrow();
      expect(c.upserts).toHaveLength(0);
      expect(c.updates.eq).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("la fecha de hoy explícita se acepta siempre", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
      const c = clienteFalso();
      await marcarTomado(c.supabase, "u1", "m1", true, "2026-10-11");
      expect(c.upserts[0].fecha).toBe("2026-10-11");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("agregar: degradación sin la columna `indicacion` (migración 031 sin aplicar)", () => {
  function clienteFalso(respuestas: { data: unknown; error: { code?: string; message: string } | null }[]) {
    const inserts: Record<string, unknown>[] = [];
    const from = () => ({
      insert: (fila: Record<string, unknown>) => {
        inserts.push(fila);
        const r = respuestas.shift()!;
        return { select: () => ({ single: async () => r }) };
      },
    });
    return { cliente: { from } as never, inserts };
  }
  const datos = { nombre: "Enalapril", horaProgramada: "08:00", momentoDia: "mañana" as const, indicacion: "con-desayuno" as const };

  it("reintenta sin `indicacion` y conserva con_comida derivado", async () => {
    const { agregar } = await import("./nucleo");
    const { cliente, inserts } = clienteFalso([
      { data: null, error: { code: "PGRST204", message: "Could not find the 'indicacion' column of 'medicamentos'" } },
      { data: { id: "m1" }, error: null },
    ]);
    await expect(agregar(cliente, "u1", datos)).resolves.toEqual({ id: "m1" });
    expect(inserts).toHaveLength(2);
    expect(inserts[0].indicacion).toBe("con-desayuno");
    expect("indicacion" in inserts[1]).toBe(false);
    expect(inserts[1].con_comida).toBe("con");
  });

  it("otro error no se reintenta y se propaga", async () => {
    const { agregar } = await import("./nucleo");
    const { cliente, inserts } = clienteFalso([{ data: null, error: { code: "23505", message: "duplicate key" } }]);
    await expect(agregar(cliente, "u1", datos)).rejects.toThrow(/No se pudo crear/);
    expect(inserts).toHaveLength(1);
  });
});
