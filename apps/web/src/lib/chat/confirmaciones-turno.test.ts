import { describe, expect, it } from "vitest";
import { cambiosTurnoDeInput, turnoQuedaEnElPasado, snapshotTurnoCoincide, textoExitoTurno, textoPropuestaTurno, tomarSnapshotTurno } from "./confirmaciones-turno";
import type { Turno } from "@/lib/turnos/tipos";

const turno: Turno = {
  id: "t1", usuario_id: "u", especialidad: "Cardiología", profesional: "Dra. Paz", lugar: null, fecha: "2026-11-20",
  hora: "10:30:00", motivo: null, recordatorio: null, acompanado: false, notas: null, created_at: "",
};

describe("cambiosTurnoDeInput", () => {
  const hoy = "2026-11-10";
  it("convierte fecha, hora y demás", () => {
    expect(cambiosTurnoDeInput({ date: "2026-11-25", time: "09:00", with_company: true, professional: " Dr. Gómez " }, hoy)).toEqual({
      datos: { fecha: "2026-11-25", hora: "09:00", acompanado: true, profesional: "Dr. Gómez" },
    });
  });
  it("rechaza una fecha pasada, formatos inválidos y no cambiar nada", () => {
    expect(cambiosTurnoDeInput({ date: "2026-11-01" }, hoy)).toHaveProperty("error");
    expect(cambiosTurnoDeInput({ time: "9" }, hoy)).toHaveProperty("error");
    expect(cambiosTurnoDeInput({}, hoy)).toHaveProperty("error");
  });
  it("vacío quita el dato", () => {
    expect(cambiosTurnoDeInput({ place: "" }, hoy)).toEqual({ datos: { lugar: null } });
  });
});

describe("snapshot del turno", () => {
  it("coincide con el mismo turno y no si cambió el día o la hora", () => {
    const s = tomarSnapshotTurno(turno);
    expect(snapshotTurnoCoincide(s, turno)).toBe(true);
    expect(snapshotTurnoCoincide(s, { ...turno, hora: "11:00" })).toBe(false);
    expect(snapshotTurnoCoincide(s, { ...turno, fecha: "2026-11-21" })).toBe(false);
    expect(snapshotTurnoCoincide(null, turno)).toBe(false);
  });
});

describe("textos", () => {
  it("la pregunta nombra el turno, la persona y el cambio", () => {
    expect(textoPropuestaTurno("delete_appointment", "Jesús", turno)).toContain("¿Borro el turno de Cardiología");
    expect(textoPropuestaTurno("delete_appointment", "Jesús", turno)).toContain("de Jesús");
    expect(textoPropuestaTurno("update_appointment", null, turno, { hora: "09:00" })).toContain("pasarlo a las 09:00");
  });
  it("el éxito dice cómo quedó", () => {
    expect(textoExitoTurno("update_appointment", null, tomarSnapshotTurno(turno), { hora: "09:00" })).toContain("a las 09:00");
  });
});

describe("turnoQuedaEnElPasado", () => {
  it("hoy más temprano que ahora ya pasó; más tarde no", () => {
    expect(turnoQuedaEnElPasado("2026-11-10", "09:00", "2026-11-10", "10:00")).toBe(true);
    expect(turnoQuedaEnElPasado("2026-11-10", "11:00", "2026-11-10", "10:00")).toBe(false);
    expect(turnoQuedaEnElPasado("2026-11-09", "23:00", "2026-11-10", "00:10")).toBe(true);
  });

  it("cambiar solo la hora de un turno de hoy a una que ya pasó se rechaza", () => {
    expect(cambiosTurnoDeInput({ time: "08:00" }, "2026-11-10", "10:00", { fecha: "2026-11-10", hora: "11:00" })).toHaveProperty("error");
  });
});
