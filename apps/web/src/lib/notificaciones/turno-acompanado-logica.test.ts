import { describe, expect, it } from "vitest";
import { refDeterminista } from "./avisos-familia-reglas";
import { payloadTurnoAcompanado, payloadTurnoAcompanadoDiaAntes } from "./mensajes";
import { debeAvisarAcompanado, destinatariosAcompanado, fechaHoraTurnoTexto } from "./turno-acompanado-logica";

const base = { acompanado: true, fecha: "2026-11-06", hora: "10:30" };

describe("debeAvisarAcompanado", () => {
  it("avisa al crear con la marca", () => {
    expect(debeAvisarAcompanado(null, base)).toBe(true);
  });
  it("no avisa al crear sin la marca", () => {
    expect(debeAvisarAcompanado(null, { ...base, acompanado: false })).toBe(false);
  });
  it("avisa cuando la marca pasa de apagada a prendida", () => {
    expect(debeAvisarAcompanado({ ...base, acompanado: false }, base)).toBe(true);
  });
  it("avisa si cambia el día o la hora de un turno acompañado", () => {
    expect(debeAvisarAcompanado(base, { ...base, fecha: "2026-11-07" })).toBe(true);
    expect(debeAvisarAcompanado(base, { ...base, hora: "11:00" })).toBe(true);
  });
  it("no avisa si no cambió nada relevante (hora con segundos incluida)", () => {
    expect(debeAvisarAcompanado({ ...base, hora: "10:30:00" }, base)).toBe(false);
  });
  it("no avisa si la marca se apaga ni si cambia el día de un turno sin marca", () => {
    expect(debeAvisarAcompanado(base, { ...base, acompanado: false })).toBe(false);
    expect(debeAvisarAcompanado({ ...base, acompanado: false }, { ...base, acompanado: false, fecha: "2026-11-08" })).toBe(false);
  });
});

describe("destinatariosAcompanado", () => {
  const vinculos = [
    { cuidador_id: "c1", estado: "aceptado" },
    { cuidador_id: "c2", estado: "aceptado" },
    { cuidador_id: "c3", estado: "pendiente" },
    { cuidador_id: "c4", estado: "revocado" },
    { cuidador_id: null, estado: "aceptado" },
    { cuidador_id: "c1", estado: "aceptado" },
  ];
  it("solo vínculos aceptados con cuenta, sin repetidos", () => {
    expect(destinatariosAcompanado(vinculos, "persona", "persona")).toEqual(["c1", "c2"]);
  });
  it("excluye a quien hizo la acción", () => {
    expect(destinatariosAcompanado(vinculos, "c1", "persona")).toEqual(["c2"]);
  });
  it("excluye al dueño del turno", () => {
    expect(destinatariosAcompanado([{ cuidador_id: "persona", estado: "aceptado" }], null, "persona")).toEqual([]);
  });
});

describe("textos", () => {
  it("formatea día y hora", () => {
    expect(fechaHoraTurnoTexto("2026-11-06", "10:30")).toBe("viernes 6 de noviembre, 10:30");
    expect(fechaHoraTurnoTexto("2026-11-05", "09:05:00")).toBe("jueves 5 de noviembre, 9:05");
  });
  it("aviso al guardar", () => {
    const p = payloadTurnoAcompanado({
      personaId: "p1",
      personaNombre: "Elsa Pérez",
      turnoId: "t1",
      especialidad: "Cardiología",
      fecha: "2026-11-06",
      hora: "10:30",
    });
    expect(p.title).toBe("Elsa pidió compañía para su turno");
    expect(p.body).toBe("Cardiología · viernes 6 de noviembre, 10:30");
    expect(p.url).toBe("/app/familia/p1");
  });
  it("recordatorio del día anterior", () => {
    const p = payloadTurnoAcompanadoDiaAntes({ personaId: "p1", personaNombre: "Elsa", turnoId: "t1", especialidad: "Cardiología", hora: "10:30" });
    expect(p.title).toBe("Mañana Elsa tiene turno de Cardiología");
    expect(p.body).toBe("A las 10:30 · pidió compañía.");
  });
});

describe("dedupe del recordatorio", () => {
  it("la clave es estable por persona, cuidador y turno, y distinta entre cuidadores", () => {
    expect(refDeterminista("p1", "c1", "t1")).toBe(refDeterminista("p1", "c1", "t1"));
    expect(refDeterminista("p1", "c1", "t1")).not.toBe(refDeterminista("p1", "c2", "t1"));
  });
});
