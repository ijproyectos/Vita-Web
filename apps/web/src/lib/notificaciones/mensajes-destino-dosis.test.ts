import { describe, expect, it } from "vitest";
import { payloadDosisResuelta, payloadDosisVencida } from "./mensajes";

const base = { elderId: "e1", elderNombre: "Jesús", medicamentoId: "m1", nombre: "Amoxicilina", horaProgramada: "09:00", fechaAR: "2026-11-11" };

describe("avisos de dosis al cuidador: llevan a la ficha nueva, nunca a /cuidar", () => {
  it("un Admin (o rol desconocido) va a la ficha de la persona", () => {
    expect(payloadDosisVencida({ ...base, rolDestino: "editar" }).url).toBe("/app/familia/e1");
    expect(payloadDosisVencida(base).url).toBe("/app/familia/e1");
    expect(payloadDosisResuelta({ ...base, rolDestino: "editar" }).url).toBe("/app/familia/e1");
  });

  it("un Lector va a /app (su vista de solo mirar)", () => {
    expect(payloadDosisVencida({ ...base, rolDestino: "ver" }).url).toBe("/app");
    expect(payloadDosisResuelta({ ...base, rolDestino: "ver" }).url).toBe("/app");
  });

  it("el 'ya tomó' sigue reemplazando a la alerta (mismo tag)", () => {
    expect(payloadDosisResuelta(base).tag).toBe(payloadDosisVencida(base).tag);
  });
});
