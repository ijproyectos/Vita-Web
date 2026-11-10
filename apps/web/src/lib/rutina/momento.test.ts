import { describe, expect, it } from "vitest";
import { horaParaMomento, minutosFueraDelMomento, momentoDelDia, moverHora, normalizarHora, ORDEN_MOMENTOS, ETIQUETA_MOMENTO, RANGO_MOMENTO } from "./momento";

describe("momentoDelDia", () => {
  it.each([
    ["00:00", "noche"],
    ["06:59", "noche"],
    ["07:00", "mañana"],
    ["11:59", "mañana"],
    ["12:00", "mediodia"],
    ["13:59", "mediodia"],
    ["14:00", "tarde"],
    ["19:59", "tarde"],
    ["20:00", "noche"],
    ["23:59", "noche"],
  ])("%s -> %s (límites de rango)", (hora, esperado) => {
    expect(momentoDelDia(hora)).toBe(esperado);
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

  it("rechaza segundos distintos de 00 (08:00:99, 08:00:30)", () => {
    expect(normalizarHora("08:00:99")).toBeNull();
    expect(normalizarHora("08:00:30")).toBeNull();
  });
});

describe("moverHora", () => {
  it("suma y resta minutos dando la vuelta al día", () => {
    expect(moverHora("08:00", 30)).toBe("08:30");
    expect(moverHora("23:30", 30)).toBe("00:00");
    expect(moverHora("00:00", -30)).toBe("23:30");
  });
});

describe("minutosFueraDelMomento", () => {
  it("adentro del momento es 0, también en la noche que cruza la medianoche", () => {
    expect(minutosFueraDelMomento("09:00", "mañana")).toBe(0);
    expect(minutosFueraDelMomento("23:30", "noche")).toBe(0);
    expect(minutosFueraDelMomento("02:00", "noche")).toBe(0);
  });

  it("mide la distancia al borde más cercano", () => {
    expect(minutosFueraDelMomento("06:30", "mañana")).toBe(30);
    expect(minutosFueraDelMomento("08:00", "noche")).toBe(60);
    expect(minutosFueraDelMomento("14:30", "mediodia")).toBe(30);
  });
});

describe("horaParaMomento", () => {
  it("respeta una hora cercana (06:30 en ayunas sigue siendo mañana)", () => {
    expect(horaParaMomento("06:30", "mañana", "08:00")).toBe("06:30");
  });

  it("mueve una hora lejana a la sugerida del momento", () => {
    expect(horaParaMomento("08:00", "noche", "21:00")).toBe("21:00");
    expect(horaParaMomento("22:00", "mañana", "08:00")).toBe("08:00");
  });

  it("si ya está en el momento no la toca", () => {
    expect(horaParaMomento("19:30", "tarde", "17:00")).toBe("19:30");
  });
});
