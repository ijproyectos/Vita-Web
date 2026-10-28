import { describe, expect, it } from "vitest";
import {
  INDICACIONES_COMIDA,
  CLAVES_INDICACION,
  conComidaDeIndicacion,
  esIndicacionComida,
  indicacionesDelMomento,
  opcionDeIndicacion,
  ajustarTomas,
  cantidadDeTomas,
  indicacionDeComida,
  relacionDeToma,
  textoRecordatorio,
  type TomaForm,
} from "./comidas";
import { momentoDelDia } from "@/lib/rutina/momento";

describe("relacionDeToma", () => {
  it("deriva el momento de la hora", () => {
    expect(relacionDeToma({ hora: "08:00", conComida: "con", indicacion: null })).toBe("Con el desayuno");
    expect(relacionDeToma({ hora: "13:00", conComida: "despues", indicacion: null })).toBe("Después del almuerzo");
    expect(relacionDeToma({ hora: "21:00", conComida: "antes", indicacion: null })).toBe("Antes de la cena");
  });
  it("null si no importa la comida", () => {
    expect(relacionDeToma({ hora: "08:00", conComida: "no-importa", indicacion: null })).toBeNull();
  });
  it("hora vacía se trata como 08:00 (mañana)", () => {
    expect(relacionDeToma({ hora: "", conComida: "con", indicacion: null })).toBe("Con el desayuno");
  });
});

describe("catálogo INDICACIONES_COMIDA", () => {
  it("el momento declarado coincide con el que deriva de la hora sugerida", () => {
    for (const c of INDICACIONES_COMIDA) {
      expect(momentoDelDia(c.hora), c.etiqueta).toBe(c.momento);
    }
  });
  it("claves únicas y reconocidas por esIndicacionComida", () => {
    expect(new Set(CLAVES_INDICACION).size).toBe(INDICACIONES_COMIDA.length);
    expect(CLAVES_INDICACION.every(esIndicacionComida)).toBe(true);
    expect(esIndicacionComida("pizza")).toBe(false);
    expect(esIndicacionComida(null)).toBe(false);
  });
  it("opcionDeIndicacion y conComidaDeIndicacion", () => {
    expect(opcionDeIndicacion("con-desayuno")?.etiqueta).toBe("Con el desayuno");
    expect(opcionDeIndicacion("nope")).toBeUndefined();
    expect(conComidaDeIndicacion("despues-cena")).toBe("despues");
    expect(conComidaDeIndicacion("ayunas")).toBe("antes");
    expect(conComidaDeIndicacion(null)).toBe("no-importa");
  });
  it("indicacionesDelMomento agrupa por momento", () => {
    expect(indicacionesDelMomento("mediodia").map((o) => o.clave)).toEqual(["antes-almuerzo", "con-almuerzo", "despues-almuerzo"]);
  });
  it("la indicación guardada manda sobre la lectura legacy", () => {
    expect(indicacionDeComida({ indicacion: "antes-dormir", con_comida: "con", momento_dia: "mañana" })).toBe("Antes de dormir");
    expect(indicacionDeComida({ indicacion: null, con_comida: "con", momento_dia: "mañana" })).toBe("Con el desayuno");
    expect(indicacionDeComida({ indicacion: null, con_comida: "no-importa", momento_dia: "noche" })).toBeNull();
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
  const t = (hora: string, conComida: TomaForm["conComida"] = "no-importa"): TomaForm => ({ hora, conComida, indicacion: null });

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
  it("sin horas invita a elegir un horario, sin hueco en la frase", () => {
    expect(textoRecordatorio([], "1x día")).toBe("Elegí un horario para que vita te recuerde.");
    expect(textoRecordatorio([], "Única vez")).toBe("Elegí un horario para que vita te recuerde.");
  });
});
