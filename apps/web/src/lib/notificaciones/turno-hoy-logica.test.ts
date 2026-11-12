import { describe, expect, it } from "vitest";
import { debeAvisarTurnoHoy, minutosHastaTurno } from "./turno-hoy-logica";

describe("debeAvisarTurnoHoy", () => {
  it("avisa un turno cargado hoy que todavía no pasó", () => {
    expect(debeAvisarTurnoHoy({ faltanMin: 300, horaAR: "10:00", huboAvisoDiaAntes: false })).toBe(true);
    expect(debeAvisarTurnoHoy({ faltanMin: 40, horaAR: "14:20", huboAvisoDiaAntes: false })).toBe(true);
  });

  it("no avisa si ya salió el de la noche anterior o si el turno pasó", () => {
    expect(debeAvisarTurnoHoy({ faltanMin: 300, horaAR: "10:00", huboAvisoDiaAntes: true })).toBe(false);
    expect(debeAvisarTurnoHoy({ faltanMin: 0, horaAR: "10:00", huboAvisoDiaAntes: false })).toBe(false);
    expect(debeAvisarTurnoHoy({ faltanMin: -10, horaAR: "10:00", huboAvisoDiaAntes: false })).toBe(false);
  });

  it("no se pisa con el de 2 horas antes", () => {
    expect(debeAvisarTurnoHoy({ faltanMin: 110, horaAR: "10:00", huboAvisoDiaAntes: false })).toBe(false);
  });

  it("de madrugada espera a las 7, salvo que el turno sea en menos de 3 horas", () => {
    expect(debeAvisarTurnoHoy({ faltanMin: 600, horaAR: "00:05", huboAvisoDiaAntes: false })).toBe(false);
    expect(debeAvisarTurnoHoy({ faltanMin: 150, horaAR: "05:00", huboAvisoDiaAntes: false })).toBe(true);
    expect(debeAvisarTurnoHoy({ faltanMin: 600, horaAR: "07:00", huboAvisoDiaAntes: false })).toBe(true);
  });
});

describe("minutosHastaTurno", () => {
  it("cuenta en hora argentina y acepta HH:MM:SS", () => {
    const ahora = new Date("2026-11-12T13:00:00-03:00").getTime();
    expect(minutosHastaTurno("2026-11-12", "15:30", ahora)).toBe(150);
    expect(minutosHastaTurno("2026-11-12", "9:00:00", ahora)).toBe(-240);
  });
});
