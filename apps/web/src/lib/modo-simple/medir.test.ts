import { describe, expect, it } from "vitest";
import type { Monitoreo } from "@/lib/mediciones/plan";
import type { Medicion } from "@/lib/mediciones/tipos";
import { esTipoMedirSimple, medirDelDia, medirQueToca, turnoHoyOManana } from "./medir";

const HOY = "2026-11-11"; // miércoles

function plan(extra: Partial<Monitoreo> = {}): Monitoreo {
  return {
    id: "p1",
    usuario_id: "u",
    tipo: "presion",
    nombre_otra: null,
    unidad_otra: null,
    horarios: [{ hora: "09:00" }, { hora: "21:00" }] as Monitoreo["horarios"],
    dias_recurrentes: [],
    fecha_fin: null,
    ...extra,
  };
}

function medicion(tipo: Medicion["tipo"], horaAR: string, valor: number, sec: number | null = null): Medicion {
  // horaAR es hora de Argentina (UTC-3).
  const [h, m] = horaAR.split(":").map(Number);
  const iso = new Date(Date.UTC(2026, 10, 11, h + 3, m)).toISOString();
  return { id: `${tipo}-${horaAR}`, usuario_id: "u", tipo, valor, valor_secundario: sec, pulso: null, contexto: null, medido_at: iso, notas: null, created_at: iso };
}

describe("medirDelDia", () => {
  it("un renglón por horario del plan, con lo anotado en su tramo", () => {
    const items = medirDelDia([plan()], [medicion("presion", "09:10", 135, 85)], "miercoles", HOY);
    expect(items.map((i) => [i.hora, i.valor])).toEqual([
      ["09:00", "135/85"],
      ["21:00", null],
    ]);
    expect(items[0]).toMatchObject({ tipo: "presion", frase: "la presión", unidad: "mmHg" });
  });

  it("respeta días y fin del plan, y deja afuera 'Otra'", () => {
    expect(medirDelDia([plan({ dias_recurrentes: ["lunes"] })], [], "miercoles", HOY)).toEqual([]);
    expect(medirDelDia([plan({ fecha_fin: "2026-11-01" })], [], "miercoles", HOY)).toEqual([]);
    expect(medirDelDia([plan({ tipo: "otra", nombre_otra: "Dolor" })], [], "miercoles", HOY)).toEqual([]);
  });

  it("ordena por hora entre planes", () => {
    const items = medirDelDia(
      [plan(), plan({ id: "p2", tipo: "glucemia", horarios: [{ hora: "08:00" }] as Monitoreo["horarios"] })],
      [],
      "miercoles",
      HOY
    );
    expect(items.map((i) => `${i.hora} ${i.tipo}`)).toEqual(["08:00 glucemia", "09:00 presion", "21:00 presion"]);
  });
});

describe("medirQueToca", () => {
  const items = medirDelDia([plan()], [], "miercoles", HOY);
  it("antes de la hora no toca nada; a la hora, ese horario", () => {
    expect(medirQueToca(items, "08:59")).toBeNull();
    expect(medirQueToca(items, "09:00")?.hora).toBe("09:00");
  });
  it("si se pasaron dos, la más reciente; anotada no toca", () => {
    expect(medirQueToca(items, "22:00")?.hora).toBe("21:00");
    const anotadas = medirDelDia([plan()], [medicion("presion", "21:05", 130, 80)], "miercoles", HOY);
    expect(medirQueToca(anotadas, "22:00")?.hora).toBe("09:00");
  });
});

describe("turnoHoyOManana", () => {
  const t = (fecha: string, hora: string) => ({ fecha, hora });
  it("el de hoy desaparece cuando pasa su hora y queda el de mañana", () => {
    const lista = [t(HOY, "10:00:00"), t("2026-11-12", "09:00:00")];
    expect(turnoHoyOManana(lista, HOY, "2026-11-12", "09:59")).toBe(lista[0]);
    expect(turnoHoyOManana(lista, HOY, "2026-11-12", "10:00")).toBe(lista[0]);
    expect(turnoHoyOManana(lista, HOY, "2026-11-12", "10:01")).toBe(lista[1]);
    expect(turnoHoyOManana([t(HOY, "10:00:00")], HOY, "2026-11-12", "11:00")).toBeNull();
  });
});

describe("esTipoMedirSimple", () => {
  it("solo los tipos del teclado", () => {
    for (const v of ["presion", "glucemia", "peso", "temperatura"]) expect(esTipoMedirSimple(v)).toBe(true);
    for (const v of ["pulso", "saturacion", "otra", "", null]) expect(esTipoMedirSimple(v)).toBe(false);
  });
});
