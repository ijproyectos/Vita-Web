import { describe, expect, it } from "vitest";
import {
  COMIDAS_SELECTOR,
  ajustarTomas,
  cantidadDeTomas,
  relacionDeToma,
  textoRecordatorio,
  type TomaForm,
} from "./comidas";
import { momentoDelDia } from "@/lib/rutina/momento";

describe("relacionDeToma", () => {
  it("deriva el momento de la hora", () => {
    expect(relacionDeToma({ hora: "08:00", conComida: "con" })).toBe("Con el desayuno");
    expect(relacionDeToma({ hora: "13:00", conComida: "despues" })).toBe("Después del almuerzo");
    expect(relacionDeToma({ hora: "21:00", conComida: "antes" })).toBe("Antes de la cena");
  });
  it("null si no importa la comida", () => {
    expect(relacionDeToma({ hora: "08:00", conComida: "no-importa" })).toBeNull();
  });
  it("hora vacía se trata como 08:00 (mañana)", () => {
    expect(relacionDeToma({ hora: "", conComida: "con" })).toBe("Con el desayuno");
  });
});

describe("COMIDAS_SELECTOR", () => {
  it("el momento declarado coincide con el que deriva de la hora", () => {
    for (const c of COMIDAS_SELECTOR) {
      expect(momentoDelDia(c.hora), c.etiqueta).toBe(c.momento);
    }
  });
});

describe("cantidadDeTomas", () => {
  it.each([
    ["1x día", 1],
    ["2x día", 2],
    ["3x día", 3],
    ["c/8 hs", 3],
    ["Única vez", 1],
    ["desconocida", 1],
    ["", 1],
  ])("%j -> %i", (frecuencia, esperado) => {
    expect(cantidadDeTomas(frecuencia)).toBe(esperado);
  });
});

describe("ajustarTomas", () => {
  const t = (hora: string, conComida: TomaForm["conComida"] = "no-importa"): TomaForm => ({ hora, conComida });

  it("completa con horas por defecto sin repetir las usadas", () => {
    const r = ajustarTomas([t("08:00", "con")], 3);
    expect(r.map((x) => x.hora)).toEqual(["08:00", "14:00", "22:00"]);
    expect(r[0].conComida).toBe("con");
  });
  it("recorta conservando las primeras", () => {
    expect(ajustarTomas([t("08:00"), t("14:00"), t("22:00")], 1)).toEqual([t("08:00")]);
  });
  it("salta las horas por defecto que ya están elegidas", () => {
    const r = ajustarTomas([t("14:00")], 2);
    expect(r.map((x) => x.hora)).toEqual(["14:00", "08:00"]);
  });
  it("cantidad 0 devuelve vacío", () => {
    expect(ajustarTomas([t("08:00")], 0)).toEqual([]);
  });
  it("no muta la entrada", () => {
    const entrada = [t("08:00")];
    ajustarTomas(entrada, 3);
    expect(entrada).toHaveLength(1);
  });
  it("hasta 7 tomas hay candidatas; más allá queda corto", () => {
    expect(ajustarTomas([], 7)).toHaveLength(7);
    expect(ajustarTomas([], 9)).toHaveLength(7);
  });
});

describe("textoRecordatorio", () => {
  it("una hora", () => {
    expect(textoRecordatorio(["08:00"], "1x día")).toBe("Vita te recuerda a las 08:00 cada día.");
  });
  it("dos horas con 'y'", () => {
    expect(textoRecordatorio(["08:00", "22:00"], "2x día")).toBe("Vita te recuerda a las 08:00 y 22:00 cada día.");
  });
  it("tres horas con coma y 'y'", () => {
    expect(textoRecordatorio(["08:00", "14:00", "22:00"], "3x día")).toBe(
      "Vita te recuerda a las 08:00, 14:00 y 22:00 cada día.",
    );
  });
  it("única vez", () => {
    expect(textoRecordatorio(["08:00"], "Única vez")).toBe("Vita te recuerda a las 08:00 una sola vez.");
  });
  // Bug conocido: sin horas la frase queda con un hueco ("a las  cada día"). Pasarlo a it al arreglarlo.
  it.fails("sin horas no deja la frase con hueco", () => {
    expect(textoRecordatorio([], "1x día")).not.toContain("  ");
  });
});
