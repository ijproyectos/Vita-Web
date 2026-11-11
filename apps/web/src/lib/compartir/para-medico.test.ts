import { describe, expect, it } from "vitest";
import { armarResumenParaMedico, restarDias, type MedicamentoParaMedico } from "./para-medico";

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
