import { describe, expect, it } from "vitest";
import { itemsDeHoy, itemsDeRemedios, leerItemsHoy, leerItemsRemedios } from "./tarjeta-rutina";

const m = (nombre: string, hora: string, extra = {}) => ({ nombre, dosis: "50", unidad: "mg", hora_programada: hora, ...extra });

describe("tarjetas de remedios del chat", () => {
  it("hoy va por hora y con su estado", () => {
    const r = itemsDeHoy([{ ...m("B", "20:00:00"), tomado: false }, { ...m("A", "08:00:00"), tomado: true }]);
    expect(r).toEqual([
      { hora: "08:00", nombre: "A", dosis: "50 mg", tomado: true },
      { hora: "20:00", nombre: "B", dosis: "50 mg", tomado: false },
    ]);
  });
  it("une los horarios de un remedio y saca los terminados", () => {
    const r = itemsDeRemedios([m("Losartán", "20:00"), m("losartán ", "08:00"), m("Viejo", "08:00", { fecha_fin: "2026-11-01" })], "2026-11-09");
    expect(r).toHaveLength(1);
    expect(r[0].horas).toEqual(["08:00", "20:00"]);
  });
  it("no repite la unidad si la dosis ya la trae", () => {
    expect(itemsDeHoy([{ ...m("A", "08:00"), dosis: "50 mg", tomado: false }])[0].dosis).toBe("50 mg");
  });
  it("sin dosis no inventa una", () => {
    expect(itemsDeHoy([{ ...m("A", "08:00"), dosis: null, tomado: false }])[0].dosis).toBeNull();
  });
  it("descarta lo que llega mal por el stream", () => {
    expect(leerItemsHoy("x")).toBeNull();
    expect(leerItemsHoy([{ hora: "08:00" }, { hora: "08:00", nombre: "A", tomado: true }])).toHaveLength(1);
    expect(leerItemsRemedios([{ nombre: "A", horas: ["08:00", 3] }])?.[0].horas).toEqual(["08:00"]);
  });
});
