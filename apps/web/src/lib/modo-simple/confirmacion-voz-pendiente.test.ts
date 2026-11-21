import { describe, expect, it } from "vitest";
import { interpretarVozPendiente, preguntaLocal } from "./confirmacion-voz";

describe("interpretarVozPendiente", () => {
  it("confirmaciones", () => {
    for (const t of ["Sí", "ya la tomé", "Listo, ya las tomé", "ya está"]) expect(interpretarVozPendiente(t)).toBe("tome");
  });
  it("posponer", () => {
    for (const t of ["más tarde", "Después", "en un rato", "ahora no", "esperame un poco"]) expect(interpretarVozPendiente(t)).toBe("posponer");
  });
  it("no la tomé (nunca se guarda solo: la pantalla pregunta)", () => {
    for (const t of ["no la tomé", "No la voy a tomar", "hoy no me la tomo", "no las tomé"]) expect(interpretarVozPendiente(t)).toBe("no_tome");
  });
  it("mezclas y cualquier otra cosa van a la charla", () => {
    for (const t of ["no, ya la tomé", "me duele la cabeza", "tengo 140 de presión", "", "no sé si la tomé"]) {
      expect(interpretarVozPendiente(t)).not.toBe("tome");
    }
    expect(interpretarVozPendiente("no, ya la tomé")).toBe("otra");
    expect(interpretarVozPendiente("me duele la cabeza")).toBe("otra");
    expect(interpretarVozPendiente("¿Ya tomé la pastilla?")).toBe("otra");
  });
});

describe("preguntaLocal", () => {
  it("reconoce las tres preguntas", () => {
    expect(preguntaLocal("¿Cuándo tengo turno?")).toBe("turno");
    expect(preguntaLocal("¿ya tomé la pastilla?")).toBe("tome");
    expect(preguntaLocal("qué me toca hoy")).toBe("toca");
    expect(preguntaLocal("me duele la cabeza")).toBeNull();
  });
});
