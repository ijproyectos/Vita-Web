import { expect, it } from "vitest";
import { payloadMedirPersona } from "./mensajes";

it("al cuidador le nombra a la persona y lo lleva a su ficha", () => {
  const p = payloadMedirPersona({ personaId: "elsa", personaNombre: "Elsa Álvarez", monitoreoId: "m", que: "la presión", hora: "08:00" });
  expect(p.title).toBe("Hora de medir la presión de Elsa");
  expect(p.url).toBe("/app/familia/elsa");
});
