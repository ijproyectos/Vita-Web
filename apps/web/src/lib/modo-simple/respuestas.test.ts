import { describe, expect, it } from "vitest";
import { listaDelDia, respuestaProximoTurno, respuestaQueMeToca, respuestaYaTome, unirNombres, type MedHoy } from "./respuestas";

const med = (nombre: string, hora: string, tomado: boolean): MedHoy => ({ nombre, hora_programada: hora, tomado });

describe("unirNombres", () => {
  it("une con coma y 'y'", () => {
    expect(unirNombres([])).toBe("");
    expect(unirNombres(["A"])).toBe("A");
    expect(unirNombres(["A", "B"])).toBe("A y B");
    expect(unirNombres(["A", "B", "C"])).toBe("A, B y C");
  });
});

describe("respuestaYaTome", () => {
  it("sin pastillas", () => {
    expect(respuestaYaTome([], "10:00")).toBe("Hoy no tenés pastillas cargadas.");
  });
  it("todas tomadas", () => {
    expect(respuestaYaTome([med("Enalapril", "08:00", true), med("Metformina", "20:00", true)], "21:00")).toBe(
      "Sí. Ya tomaste todas las pastillas de hoy. Muy bien."
    );
  });
  it("pendiente que ya tocaba", () => {
    expect(respuestaYaTome([med("Enalapril", "10:00", false)], "10:30")).toBe(
      "Todavía no tomaste Enalapril de las 10 de la mañana."
    );
  });
  it("la hora justa cuenta como que ya toca", () => {
    expect(respuestaYaTome([med("Enalapril", "10:00:00", false)], "10:00")).toContain("Todavía no tomaste");
  });
  it("varias pendientes en la misma hora y en horas distintas", () => {
    expect(respuestaYaTome([med("A", "08:00", false), med("B", "08:00", false)], "09:00")).toBe(
      "Todavía no tomaste A y B de las 8 de la mañana."
    );
    expect(respuestaYaTome([med("A", "08:00", false), med("B", "13:00", false)], "14:00")).toBe(
      "Todavía no tomaste A de las 8 de la mañana y B de la 1 de la tarde."
    );
  });
  it("mezcla: tomó lo de la mañana y lo siguiente es futuro", () => {
    expect(respuestaYaTome([med("A", "08:00", true), med("B", "20:00", false)], "10:00")).toBe(
      "Sí, ya tomaste A. La próxima es a las 8 de la noche."
    );
  });
  it("nada tomado pero nada le toca todavía", () => {
    expect(respuestaYaTome([med("A", "20:00", false)], "10:00")).toBe(
      "Todavía no te toca ninguna. La próxima es a las 8 de la noche."
    );
  });
  it("hora ilegible: no inventa hora", () => {
    expect(respuestaYaTome([med("A", "xx", false)], "10:00")).toBe("Todavía no tomaste A.");
  });
  it("hora actual ilegible trata lo pendiente como pendiente", () => {
    expect(respuestaYaTome([med("A", "20:00", false)], "")).toContain("Todavía no tomaste A");
  });
});

describe("respuestaQueMeToca", () => {
  it("sin pastillas", () => {
    expect(respuestaQueMeToca([])).toBe("Hoy no tenés pastillas cargadas.");
  });
  it("todas tomadas", () => {
    expect(respuestaQueMeToca([med("A", "08:00", true), med("B", "21:00", true)])).toBe("Ya tomaste todas las de hoy. Muy bien.");
  });
  it("una sola pendiente", () => {
    expect(respuestaQueMeToca([med("A", "08:00", true), med("Losartán", "21:00", false)])).toBe("Te falta una: Losartán, a las 9 de la noche.");
  });
  it("varias pendientes: cuántas y la próxima, sin recitar el día", () => {
    const r = respuestaQueMeToca([med("C", "22:00", false), med("A", "08:00", true), med("B", "21:00", false), med("D", "21:00", false)]);
    expect(r).toBe("Te faltan 3. La próxima: B y D, a las 9 de la noche.");
    expect(r).not.toContain("A");
  });
  it("hora ilegible", () => {
    expect(respuestaQueMeToca([med("X", "??", false)])).toBe("Te falta una: X, sin horario.");
  });
});

describe("listaDelDia", () => {
  it("una por renglón, ordenada por hora, ilegibles al final", () => {
    expect(listaDelDia([med("C", "22:00", false), med("X", "??", false), med("A", "08:00:00", true)])).toEqual([
      { hora: "08:00", nombre: "A", tomado: true },
      { hora: "22:00", nombre: "C", tomado: false },
      { hora: null, nombre: "X", tomado: false },
    ]);
  });
  it("sin nombre dice Pastilla", () => {
    expect(listaDelDia([med(" ", "08:00", false)])[0].nombre).toBe("Pastilla");
  });
});

describe("respuestaProximoTurno", () => {
  const hoy = "2026-05-13";
  const t = (fecha: string, hora = "10:30") => ({ fecha, hora, especialidad: "Cardiología", profesional: null });
  it("sin turno", () => {
    expect(respuestaProximoTurno(null, hoy)).toBe("No tenés turnos cargados.");
  });
  it("hoy", () => {
    expect(respuestaProximoTurno(t(hoy), hoy)).toBe("Tu próximo turno es hoy, a las 10 y media de la mañana, con Cardiología.");
  });
  it("mañana", () => {
    expect(respuestaProximoTurno(t("2026-05-14", "16:00"), hoy)).toBe(
      "Tu próximo turno es mañana, a las 4 de la tarde, con Cardiología."
    );
  });
  it("otra fecha con día de la semana", () => {
    expect(respuestaProximoTurno(t("2026-05-21", "09:00"), hoy)).toBe(
      "Tu próximo turno es el jueves 21 de mayo, a las 9 de la mañana, con Cardiología."
    );
  });
  it("hora inválida: la omite", () => {
    expect(respuestaProximoTurno(t(hoy, "nada"), hoy)).toBe("Tu próximo turno es hoy, con Cardiología.");
  });
  it("fecha inválida", () => {
    expect(respuestaProximoTurno(t("mañana"), hoy)).toContain("no pude leer la fecha");
  });
});

describe("nombres vacíos", () => {
  it("respuestaQueMeToca usa una palabra neutra si ninguna fila tiene nombre", () => {
    expect(respuestaQueMeToca([med("", "08:00", false)])).toBe("Te falta una: una pastilla, a las 8 de la mañana.");
    expect(respuestaQueMeToca([med(" ", "08:00", false), med("", "08:00", false)])).toBe("Te faltan 2. La próxima: 2 pastillas, a las 8 de la mañana.");
  });
  it("respuestaYaTome no deja frases vacías", () => {
    const r = respuestaYaTome([med("", "08:00", false), med("", "08:00", false)], "09:00");
    expect(r).toContain("2 pastillas");
    expect(r).not.toMatch(/\s\./);
  });
});
