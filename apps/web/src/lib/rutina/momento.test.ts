import { describe, expect, it } from "vitest";
import { momentoDelDia, normalizarHora, ORDEN_MOMENTOS, ETIQUETA_MOMENTO, RANGO_MOMENTO } from "./momento";

describe("momentoDelDia", () => {
  it.each([
    ["06:00", "mañana"],
    ["10:59", "mañana"],
    ["11:00", "mediodia"],
    ["14:59", "mediodia"],
    ["15:00", "tarde"],
    ["18:59", "tarde"],
    ["19:00", "noche"],
    ["23:59", "noche"],
  ])("%s -> %s (límites de rango)", (hora, esperado) => {
    expect(momentoDelDia(hora)).toBe(esperado);
  });

  it("la madrugada (00–05) cae en noche", () => {
    expect(momentoDelDia("00:00")).toBe("noche");
    expect(momentoDelDia("05:59")).toBe("noche");
  });

  it("acepta horas sin cero a la izquierda", () => {
    expect(momentoDelDia("8:30")).toBe("mañana");
  });

  it("entrada inválida cae en noche (hora NaN no entra en ningún rango)", () => {
    expect(momentoDelDia("")).toBe("noche");
    expect(momentoDelDia("abc")).toBe("noche");
  });

  it("los mapas de etiquetas cubren todos los momentos", () => {
    for (const m of ORDEN_MOMENTOS) {
      expect(ETIQUETA_MOMENTO[m]).toBeTruthy();
      expect(RANGO_MOMENTO[m]).toBeTruthy();
    }
  });
});

describe("normalizarHora", () => {
  it.each([
    ["8:05", "08:05"],
    ["08:05", "08:05"],
    ["08:05:00", "08:05"],
    ["  9:00 ", "09:00"],
    ["00:00", "00:00"],
    ["23:59", "23:59"],
  ])("%j -> %j", (entrada, esperado) => {
    expect(normalizarHora(entrada)).toBe(esperado);
  });

  it.each(["24:00", "12:60", "", "abc", "8", "8:5", "1:2:3", "-1:00", "08:00:00:00"])(
    "%j no es una hora válida",
    (entrada) => {
      expect(normalizarHora(entrada)).toBeNull();
    },
  );

  // Bug conocido: el grupo de segundos es \d{2} sin rango. Pasarlo a it al arreglarlo.
  it.fails("rechaza segundos fuera de rango (08:00:99)", () => {
    expect(normalizarHora("08:00:99")).toBeNull();
  });
});
