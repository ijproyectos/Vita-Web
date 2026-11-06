import { describe, expect, it } from "vitest";
import { cuidadorRecibeCumple, cumpleanerosDeHoy, enVentanaCumpleanos, personaRecibeCumple } from "./cumpleanos-logica";

describe("cumpleaños", () => {
  it("ventana de 09:00 a 11:59", () => {
    expect(enVentanaCumpleanos("08:59")).toBe(false);
    expect(enVentanaCumpleanos("09:00")).toBe(true);
    expect(enVentanaCumpleanos("11:59")).toBe(true);
    expect(enVentanaCumpleanos("12:00")).toBe(false);
  });
  it("elige quién cumple hoy y qué edad cumple", () => {
    const perfiles = [
      { id: "a", nombre: "Ana", fecha_nacimiento: "1950-11-06" },
      { id: "b", nombre: "Beto", fecha_nacimiento: "1950-11-07" },
      { id: "c", nombre: "Cora", fecha_nacimiento: null },
      { id: "d", nombre: "Dani", fecha_nacimiento: "2000-02-29" },
    ];
    expect(cumpleanerosDeHoy(perfiles, "2026-11-06")).toEqual([{ ...perfiles[0], cumple: 76 }]);
    expect(cumpleanerosDeHoy(perfiles, "2027-02-28").map((p) => p.id)).toEqual(["d"]);
    expect(cumpleanerosDeHoy(perfiles, "2028-02-28")).toEqual([]);
  });
  it("respeta el silencio nocturno y el toggle del cuidador", () => {
    expect(personaRecibeCumple(false)).toBe(true);
    expect(personaRecibeCumple(true)).toBe(false);
    expect(cuidadorRecibeCumple({ resumen_dia: true }, false)).toBe(true);
    expect(cuidadorRecibeCumple({ resumen_dia: false }, false)).toBe(false);
    expect(cuidadorRecibeCumple({ resumen_dia: true }, true)).toBe(false);
  });
});
