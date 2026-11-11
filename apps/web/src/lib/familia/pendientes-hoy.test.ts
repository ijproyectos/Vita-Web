import { describe, expect, it } from "vitest";
import { resumenHoy, type DosisHoy } from "./pendientes-hoy";

const d = (p: Partial<DosisHoy>): DosisHoy => ({ id: "a", nombre: "Enalapril", dosis: "10", unidad: "mg", hora_programada: "08:00", tomado: false, ...p });

describe("resumenHoy", () => {
  it("solo cuenta como pendiente lo que ya pasó y sigue sin tomar", () => {
    const r = resumenHoy(
      [d({ id: "1", tomado: true }), d({ id: "2", hora_programada: "09:00:00" }), d({ id: "3", hora_programada: "20:00" })],
      "11:40"
    );
    expect(r.subtitulo).toBe("1 de 3 tomadas");
    expect(r.pendientes.map((p) => p.id)).toEqual(["2"]);
    expect(r.pendientes[0].meta).toBe("10 mg · 09:00 hs · hace 2 h");
  });

  it("una dosis de esta misma hora todavía no está pendiente", () => {
    expect(resumenHoy([d({ hora_programada: "11:40" })], "11:40").pendientes).toEqual([]);
  });

  it("usa minutos si pasó menos de una hora y omite la dosis vacía", () => {
    expect(resumenHoy([d({ dosis: null, hora_programada: "11:10" })], "11:40").pendientes[0].meta).toBe("11:10 hs · hace 30 min");
  });

  it("lo que dijo que no tomó sale de pendientes y va aparte", () => {
    const r = resumenHoy([d({ id: "1", hora_programada: "08:00" }), d({ id: "2", hora_programada: "09:00" })], "11:40", new Set(["1"]));
    expect(r.pendientes.map((p) => p.id)).toEqual(["2"]);
    expect(r.noTomadas).toEqual([{ id: "1", nombre: "Enalapril", meta: "08:00 hs · dijo que no la tomó" }]);
  });
});
