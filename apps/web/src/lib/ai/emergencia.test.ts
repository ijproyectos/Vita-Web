import { describe, expect, it } from "vitest";
import { detectarEmergencia, textoEmergencia } from "./emergencia";

describe("detectarEmergencia", () => {
  it.each([
    "tengo dolor en el pecho",
    "dolor fuerte de pecho",
    "mi papá no puede respirar",
    "no puedo respirar",
    "se desmayó mi mamá",
    "tuvo una convulsión",
    "sangra mucho",
    "tiene una hemorragia",
    "creo que es un infarto",
  ])("%j -> emergencia", (t) => {
    expect(detectarEmergencia(t)).toBe("emergencia");
  });

  it.each(["me quiero morir", "quiero matarme", "pienso en el suicidio", "no quiero seguir vivir", "no quiero vivir"])(
    "%j -> suicidio",
    (t) => {
      expect(detectarEmergencia(t)).toBe("suicidio");
    }
  );

  it.each([
    "tomé de más",
    "tomé el doble de la pastilla",
    "me tomé doble dosis",
    "me equivoqué de pastilla",
    "sobredosis",
    "se envenenó",
  ])("%j -> intoxicacion", (t) => {
    expect(detectarEmergencia(t)).toBe("intoxicacion");
  });

  it("suicidio tiene prioridad sobre las demás categorías", () => {
    expect(detectarEmergencia("me quiero morir, tomé de más")).toBe("suicidio");
  });

  it("ignora mayúsculas y tildes", () => {
    expect(detectarEmergencia("DOLOR EN EL PECHO")).toBe("emergencia");
  });

  it.each(["qué me toca hoy", "agendá turno con el dentista", "", "tomé mi pastilla de las 8"])("%j -> null", (t) => {
    expect(detectarEmergencia(t)).toBeNull();
  });
});

describe("textoEmergencia", () => {
  it("devuelve texto con teléfonos para cada tipo", () => {
    expect(textoEmergencia("suicidio")).toContain("135");
    expect(textoEmergencia("intoxicacion")).toContain("0800-333-0160");
    expect(textoEmergencia("emergencia")).toContain("107");
  });
});
