import { describe, expect, it } from "vitest";
import { fechaTurnoEnPalabras, horaTurnoTexto, lineasDeTurno } from "./formato";

describe("formato de turno", () => {
  it("fecha en palabras", () => {
    expect(fechaTurnoEnPalabras("2026-11-12")).toBe("jueves 12 de noviembre");
    expect(fechaTurnoEnPalabras("2027-01-05", 2026)).toBe("martes 5 de enero de 2027");
    expect(fechaTurnoEnPalabras("basura")).toBe("basura");
  });
  it("hora", () => {
    expect(horaTurnoTexto("09:00")).toBe("9:00\u00a0h");
    expect(horaTurnoTexto("16:30:00")).toBe("16:30\u00a0h");
  });
  it("líneas de una fila", () => {
    expect(lineasDeTurno({ especialidad: "Cardiólogo", fecha: "2026-11-12", hora: "09:00", lugar: " Clínica Santa Fe, Av. Santa Fe 1234 " })).toEqual({
      titulo: "Cardiólogo",
      dia: "jueves 12 de noviembre",
      hora: "9:00\u00a0h",
      donde: "Clínica Santa Fe, Av. Santa Fe 1234",
    });
    expect(lineasDeTurno({ especialidad: "Clínico", profesional: "Dra. Paz", fecha: "2026-11-12", hora: "9:05" }).donde).toBeNull();
  });
});
