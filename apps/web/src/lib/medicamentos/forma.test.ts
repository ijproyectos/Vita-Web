import { describe, expect, it } from "vitest";
import {
  consumoDeToma,
  etiquetaCantidad,
  frecuenciaDeTomas,
  pasoCantidad,
  resumenStock,
  seCuentaConFoto,
  siguienteHora,
} from "./forma";

describe("seCuentaConFoto", () => {
  it("solo las pastillas se cuentan con foto", () => {
    expect(seCuentaConFoto("pastilla")).toBe(true);
    for (const forma of ["jarabe", "gotas", "inyeccion", "otro"]) expect(seCuentaConFoto(forma)).toBe(false);
  });
  it("sin forma guardada se trata como pastilla", () => {
    expect(seCuentaConFoto(undefined)).toBe(true);
    expect(seCuentaConFoto(null)).toBe(true);
  });
});

describe("etiquetaCantidad", () => {
  it("muestra medias pastillas", () => {
    expect(etiquetaCantidad("pastilla", 0.5)).toBe("½ pastilla");
    expect(etiquetaCantidad("pastilla", 1)).toBe("1 pastilla");
    expect(etiquetaCantidad("pastilla", 1.5)).toBe("1½ pastillas");
  });
  it("usa la unidad de cada forma", () => {
    expect(etiquetaCantidad("jarabe", 2.5)).toBe("2,5 ml");
    expect(etiquetaCantidad("gotas", 1)).toBe("1 gota");
    expect(etiquetaCantidad("inyeccion", 2)).toBe("2 aplicaciones");
    expect(etiquetaCantidad("otro", 1)).toBe("1 vez");
  });
});

describe("pasoCantidad", () => {
  it("respeta el paso y los topes", () => {
    expect(pasoCantidad("pastilla", 1, 1)).toBe(1.5);
    expect(pasoCantidad("pastilla", 0.5, -1)).toBe(0.5);
    expect(pasoCantidad("pastilla", 4, 1)).toBe(4);
    expect(pasoCantidad("jarabe", 5, -1)).toBe(2.5);
  });
});

describe("consumoDeToma", () => {
  it("convierte gotas a ml", () => {
    expect(consumoDeToma("gotas", 20)).toBe(1);
    expect(consumoDeToma("pastilla", 1.5)).toBe(1.5);
  });
});

describe("resumenStock", () => {
  it("texto vacío según la forma", () => {
    expect(resumenStock("pastilla", null, 1)).toEqual({ texto: "Sin contar · opcional", alerta: false });
    expect(resumenStock("jarabe", null, 5)).toEqual({ texto: "Sin cargar · opcional", alerta: false });
  });
  it("calcula los días y alerta con 5 o menos", () => {
    expect(resumenStock("pastilla", 30, 2)).toEqual({ texto: "30 pastillas · te alcanzan 15 días", alerta: false });
    expect(resumenStock("pastilla", 5, 1)).toEqual({ texto: "5 pastillas · te alcanzan 5 días", alerta: true });
    expect(resumenStock("jarabe", 7.5, 5).texto).toBe("7,5 ml · te alcanzan 1 día");
  });
});

describe("siguienteHora", () => {
  it("suma 12 h a la primera toma y 6 h a las siguientes, con tope", () => {
    expect(siguienteHora(["08:00"])).toBe("20:00");
    expect(siguienteHora(["08:00", "14:00"])).toBe("20:00");
    expect(siguienteHora(["08:00", "20:00"])).toBe("23:00");
  });
});

it("frecuenciaDeTomas deriva el texto", () => {
  expect(frecuenciaDeTomas(2)).toBe("2x día");
  expect(frecuenciaDeTomas(0)).toBe("1x día");
});
