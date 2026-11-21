import { describe, expect, it } from "vitest";
import { payloadResumenDia } from "./mensajes";

const base = { personaId: "p", personaNombre: "Elsa Pérez", tomadas: 2, total: 4, fechaAR: "2026-11-10" };

describe("payloadResumenDia con 'No la tomé'", () => {
  it("separa lo que quedó sin tomar de lo que dijo que no tomó", () => {
    const p = payloadResumenDia({ ...base, pendientes: [{ nombre: "Magnesio", hora: "22:00" }], noTomadas: [{ nombre: "Losartán", hora: "21:00" }] });
    expect(p.title).toBe("Hoy Elsa tomó 2 de 4");
    expect(p.body).toBe("Quedó sin tomar: Magnesio (22:00). Dijo que no tomó: Losartán (21:00).");
  });
  it("solo las que dijo que no tomó", () => {
    expect(payloadResumenDia({ ...base, pendientes: [], noTomadas: [{ nombre: "Losartán", hora: "21:00" }] }).body).toBe("Dijo que no tomó: Losartán (21:00).");
  });
  it("sin nada pendiente sigue igual", () => {
    expect(payloadResumenDia({ ...base, tomadas: 4, pendientes: [] }).body).toBe("Buen día para Elsa: completó todas sus tomas.");
  });
});

describe("payloadResumenDia con mediciones no anotadas", () => {
  it("las suma al final", () => {
    const p = payloadResumenDia({ ...base, tomadas: 4, pendientes: [], medicionesSinAnotar: [{ que: "la presión", hora: "09:00" }] });
    expect(p.body).toBe("No anotó la presión (9:00).");
  });
  it("junto con lo que quedó sin tomar", () => {
    const p = payloadResumenDia({ ...base, pendientes: [{ nombre: "Magnesio", hora: "20:00" }], medicionesSinAnotar: [{ que: "la glucemia", hora: "08:00" }, { que: "la presión", hora: "19:00" }] });
    expect(p.body).toBe("Quedó sin tomar: Magnesio (20:00). No anotó la glucemia (8:00), la presión (19:00).");
  });
});
