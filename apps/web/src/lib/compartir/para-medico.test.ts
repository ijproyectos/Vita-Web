import { describe, expect, it } from "vitest";
import { agruparMediciones, armarResumenParaMedico, restarDias, type MedicamentoParaMedico } from "./para-medico";

const HOY = "2026-11-11"; // miércoles

function med(extra: Partial<MedicamentoParaMedico> = {}): MedicamentoParaMedico {
  return { nombre: "Enalapril", dosis: "10", unidad: "mg", hora_programada: "09:00:00", momento_dia: "mañana", alta: "2026-10-01", ...extra };
}

function armar(over: Partial<Parameters<typeof armarResumenParaMedico>[0]> = {}) {
  return armarResumenParaMedico({
    perfil: { nombre: "Elsa Pérez", fecha_nacimiento: "1950-11-12", contacto_emergencia_nombre: "Mica" },
    medicamentos: [med()],
    stockPorInventario: new Map(),
    tomadas: [],
    estudios: [],
    mediciones: [],
    hoy: HOY,
    generadoEn: "2026-11-11T15:00:00Z",
    ...over,
  });
}

describe("armarResumenParaMedico", () => {
  it("nombre de pila, edad cumplida y nunca turnos", () => {
    const r = armar();
    expect(r.paciente.nombre).toBe("Elsa");
    expect(r.paciente.edad).toBe(75); // cumple 76 mañana
    expect(r.turnos).toEqual([]);
    expect(r.contacto_emergencia.nombre).toBe("Mica");
  });

  it("deja afuera los remedios terminados y ordena por hora", () => {
    const r = armar({
      medicamentos: [med({ nombre: "B", hora_programada: "21:00:00" }), med({ nombre: "A" }), med({ nombre: "Viejo", fecha_fin: "2026-11-01" })],
    });
    expect(r.medicamentos.map((m) => `${m.nombre} ${m.hora}`)).toEqual(["A 09:00", "B 21:00"]);
  });

  it("cumplimiento de 14 días: respeta días de la semana, alta y tope por día", () => {
    const dosDias = [HOY, restarDias(HOY, 1)];
    const r = armar({
      medicamentos: [
        med(), // todos los días: 14 programadas
        med({ nombre: "Solo lunes", dias_recurrentes: ["lunes"] }), // lunes 9/11 y 2/11: 2
        med({ nombre: "Nuevo", alta: HOY }), // solo hoy: 1
      ],
      tomadas: [...dosDias, HOY, HOY, HOY], // hoy marca 4, pero solo hay 2 programadas
    });
    expect(r.adherencia.programadas).toBe(17);
    expect(r.adherencia.tomadas).toBe(3);
    expect(r.adherencia.porcentaje).toBe(18);
  });

  it("sin tomas programadas el porcentaje es null", () => {
    expect(armar({ medicamentos: [] }).adherencia.porcentaje).toBeNull();
  });

  it("estudios listos, los más nuevos primero (sin fecha al final), máximo 5", () => {
    const e = (fecha: string | null, created_at: string, estado = "listo") => ({ tipo: "Lab", fecha, resumen: null, valores: [{ nombre: "HbA1c", valor: "6" }, { x: 1 }], estado, created_at });
    const r = armar({
      estudios: [
        e(null, "2026-11-10"),
        e("2026-01-01", "a"),
        e("2026-05-01", "a"),
        e("2026-09-01", "a", "error"),
        e("2026-03-01", "a"),
        e("2026-04-01", "a"),
        e("2026-02-01", "a"),
      ],
    });
    expect(r.estudios.map((x) => x.fecha)).toEqual(["2026-05-01", "2026-04-01", "2026-03-01", "2026-02-01", "2026-01-01"]);
    expect(r.estudios[0].valores).toEqual([{ nombre: "HbA1c", valor: "6" }]);
  });
});

describe("mediciones para el médico", () => {
  const m = (tipo: string, valor: number, medido_at: string, extra: object = {}) => ({ tipo, valor, valor_secundario: null, contexto: null, medido_at, ...extra });

  it("el resumen las ordena de la más nueva a la más vieja", () => {
    const r = armar({ mediciones: [m("peso", 64, "2026-11-01T10:00:00Z"), m("peso", 63.5, "2026-11-10T10:00:00Z")] });
    expect(r.mediciones?.map((x) => x.valor)).toEqual([63.5, 64]);
  });

  it("agrupa por métrica con promedio, cantidad y las últimas 5", () => {
    const presiones = [130, 120, 140, 125, 135, 128].map((s, i) => m("presion", s, `2026-11-0${i + 1}T09:00:00Z`, { valor_secundario: 80 + i }));
    const grupos = agruparMediciones([
      ...presiones,
      m("glucemia", 110, "2026-11-05T08:00:00Z", { contexto: "ayunas" }),
      m("otra", 3, "2026-11-04T08:00:00Z", { nombre_otra: "Dolor", unidad_otra: "/10" }),
      m("desconocida", 1, "2026-11-04T08:00:00Z"),
    ]);
    expect(grupos.map((g) => g.nombre)).toEqual(["Presión arterial", "Glucemia", "Dolor"]);
    const presion = grupos[0];
    expect(presion.cantidad).toBe(6);
    expect(presion.promedio).toBe("130/83");
    expect(presion.ultimas).toHaveLength(5);
    expect(presion.ultimas[0]).toMatchObject({ valor: "128/85", medidoAt: "2026-11-06T09:00:00Z" });
    expect(grupos[1].ultimas[0].contexto).toBe("En ayunas");
    expect(grupos[2].unidad).toBe("/10");
  });
});
