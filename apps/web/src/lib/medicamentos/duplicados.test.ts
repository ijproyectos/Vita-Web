import { describe, expect, it } from "vitest";
import { horariosCoinciden, normalizarHoraDuplicados, normalizarHorarioMedicamento, traducirErrorDuplicado, ErrorEntradaMedicamento, ErrorHorarioMedicamentoDuplicado } from "./duplicados";
import type { DiaSemana } from "./tipos";

const toma = (nombre = "Losartán", horaProgramada = "08:00", diasRecurrentes: DiaSemana[] = []) => ({ nombre, horaProgramada, diasRecurrentes });

describe("identidad de un horario de medicamento", () => {
  it("normaliza únicamente mayúsculas, espacios y formato de hora", () => {
    expect(horariosCoinciden(toma("  LOSARTÁN  potásico ", "8:00"), toma("losartán\tpotásico", "08:00:00"))).toBe(true);
    expect(horariosCoinciden(toma("Losartan"), toma())).toBe(false);
    expect(horariosCoinciden(toma("Cozaar"), toma())).toBe(false);
    expect(horariosCoinciden(toma(), toma("Losartán", "09:00"))).toBe(false);
  });
  it("acepta espacios exteriores sin modificar la hora", () => {
    expect(normalizarHoraDuplicados(" 8:00 ")).toBe("08:00");
  });
  it("detecta días solapados y trata [] como diario", () => {
    expect(horariosCoinciden(toma(), toma("Losartán", "08:00", ["lunes"]))).toBe(true);
    expect(horariosCoinciden(toma("Losartán", "08:00", ["lunes", "martes"]), toma("Losartán", "08:00", ["martes"]))).toBe(true);
    expect(horariosCoinciden(toma("Losartán", "08:00", ["lunes"]), toma("Losartán", "08:00", ["martes"]))).toBe(false);
  });
  it.each(["24:00", "12:60", "08:00:01", "8:00:00", "08:0", "-1:00", "08:00:00.0"])("rechaza hora %s", (hora) => {
    expect(() => normalizarHoraDuplicados(hora)).toThrow("horarios");
  });
  it("una hora inválida lanza el error de entrada de dominio", () => {
    expect(() => normalizarHoraDuplicados("25:99")).toThrow(ErrorEntradaMedicamento);
    expect(() => normalizarHoraDuplicados("08:00:99")).toThrow(ErrorEntradaMedicamento);
  });
  it.each(["0:00", "00:00", "00:00:00"])("acepta medianoche %s", (hora) => {
    expect(normalizarHoraDuplicados(hora)).toBe("00:00");
  });
  it("rechaza identidad vacía y días inválidos sin convertirlos a diario", () => {
    expect(() => normalizarHorarioMedicamento(toma("  "))).toThrow("nombre");
    for (const diasRecurrentes of [null, "lunes", ["Lunes"], [1], [null]]) {
      expect(() => normalizarHorarioMedicamento({ ...toma(), diasRecurrentes: diasRecurrentes as DiaSemana[] })).toThrow("días");
    }
  });
  it("traduce solo la exclusión específica", () => {
    expect(() => traducirErrorDuplicado({ code: "23P01", message: 'conflicts with exclusion constraint "medicamentos_sin_horarios_duplicados"' })).toThrow(ErrorHorarioMedicamentoDuplicado);
    expect(() => traducirErrorDuplicado({ code: "23505", message: '"medicamentos_sin_horarios_duplicados"' })).not.toThrow();
    expect(() => traducirErrorDuplicado({ code: "23P01", message: '"otra_exclusion"' })).not.toThrow();
  });
});
