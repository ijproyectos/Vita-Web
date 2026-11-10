import { describe, expect, it } from "vitest";
import { leerTurnoDelFormulario } from "./formulario";

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fd;
}

describe("leerTurnoDelFormulario", () => {
  it("lee los campos y limpia espacios", () => {
    const r = leerTurnoDelFormulario(
      form({ especialidad: " Cardiología ", fecha: "2026-11-20", hora: "10:30", profesional: " Dra. Paz ", lugar: "", acompanado: "on" })
    );
    expect(r).toEqual({
      ok: true,
      datos: { especialidad: "Cardiología", profesional: "Dra. Paz", lugar: null, fecha: "2026-11-20", hora: "10:30", acompanado: true, notas: null },
    });
  });

  it("exige especialidad, fecha y hora", () => {
    expect(leerTurnoDelFormulario(form({ especialidad: "Clínica", hora: "10:30" })).ok).toBe(false);
  });

  it("solo incluye dirección, teléfono y qué llevar si el formulario los mandó", () => {
    const sin = leerTurnoDelFormulario(form({ especialidad: "Clínica", fecha: "2026-11-20", hora: "10:30" }));
    expect(sin.ok && "direccion" in sin.datos).toBe(false);
    const con = leerTurnoDelFormulario(
      form({ especialidad: "Clínica", fecha: "2026-11-20", hora: "10:30", direccion: " Av. Cabildo 2450 ", telefono: "", llevar: '[{"t":"DNI","ok":true}]' })
    );
    expect(con.ok && con.datos).toMatchObject({ direccion: "Av. Cabildo 2450", telefono: null, llevar: [{ t: "DNI", ok: true }] });
  });

  it("rechaza un teléfono incompleto", () => {
    const r = leerTurnoDelFormulario(form({ especialidad: "Clínica", fecha: "2026-11-20", hora: "10:30", telefono: "12" }));
    expect(r.ok).toBe(false);
  });
});
