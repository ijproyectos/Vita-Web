import { describe, expect, it } from "vitest";
import {
  payloadDosisResuelta,
  payloadDosisVencida,
  payloadPersonaEnVita,
  payloadResumenDia,
  payloadStockPersona,
  payloadTurnoPersonaDiaAntes,
} from "./mensajes";

const base = { elderId: "e", elderNombre: "Elsa", medicamentoId: "m", nombre: "Glucophage", horaProgramada: "08:00", fechaAR: "2026-11-11" };

describe("avisos a quien cuida, como en el diseño", () => {
  it("no confirmó: relación clara y cuántos avisos le llegaron", () => {
    const p = payloadDosisVencida({ ...base, relacion: "Mamá", avisosEnviados: 2 });
    expect(p.title).toBe("Mamá no confirmó su Glucophage");
    expect(p.body).toBe("Era a las 8:00 · ya le llegaron 2 avisos");
    expect(payloadDosisVencida({ ...base, avisosEnviados: 1 }).body).toBe("Era a las 8:00 · ya le llegó 1 aviso");
    expect(payloadDosisVencida({ ...base, relacion: "Hijo/a" }).title).toBe("Elsa no confirmó su Glucophage");
    expect(payloadDosisVencida({ ...base }).body).toBe("Era a las 8:00");
  });

  it("ya tomó reemplaza la alerta (mismo tag)", () => {
    const vencida = payloadDosisVencida({ ...base, relacion: "Mamá" });
    const resuelta = payloadDosisResuelta({ ...base, relacion: "Mamá" });
    expect(resuelta.title).toBe("Mamá ya tomó su Glucophage");
    expect(resuelta.tag).toBe(vencida.tag);
  });

  it("resumen, stock, turno y ya está en vita en minúscula a mitad de frase", () => {
    expect(payloadResumenDia({ personaId: "e", personaNombre: "Elsa", tomadas: 4, total: 5, pendientes: [{ nombre: "X", hora: "21:00" }], fechaAR: "f", relacion: "Mamá" }).title).toBe("Hoy mamá tomó 4 de 5");
    expect(payloadStockPersona({ personaId: "e", personaNombre: "Elsa", inventarioId: "i", nombre: "Losacor", stock: 5, fechaAR: "f", relacion: "Mamá" }).title).toBe("A mamá le quedan 5 pastillas de Losacor");
    expect(payloadTurnoPersonaDiaAntes({ personaId: "e", personaNombre: "Elsa", turnoId: "t", especialidad: "Kinesiología", profesional: null, hora: "17:00", relacion: "Mamá" }).title).toBe("Mañana mamá tiene Kinesiología");
    expect(payloadPersonaEnVita({ personaId: "e", personaNombre: "Elsa Pérez", relacion: "Mamá" }).title).toBe("Mamá ya está en vita");
  });
});
