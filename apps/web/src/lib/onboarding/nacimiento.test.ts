import { describe, expect, it } from "vitest";
import {
  combinarPartes,
  edadDesdeFecha,
  edadQueCumple,
  esCumpleHoy,
  leerEdad,
  leerPartesFecha,
  requiereConfirmarEdad,
  resolverNacimiento,
} from "./nacimiento";

const HOY = "2026-11-06";
const leer = (t: string) => leerPartesFecha(t, HOY);

describe("leerPartesFecha", () => {
  it("lee dd/mm/aaaa y variantes", () => {
    expect(leer("12/3/1950")).toEqual({ dia: 12, mes: 3, anio: 1950 });
    expect(leer("12-03-50")).toEqual({ dia: 12, mes: 3, anio: 1950 });
    expect(leer("nació el 05.11.1948")).toEqual({ dia: 5, mes: 11, anio: 1948 });
  });
  it("lee fechas con el mes en palabras", () => {
    expect(leer("12 de marzo del 50")).toEqual({ dia: 12, mes: 3, anio: 1950 });
    expect(leer("12 de marzo de 1950")).toEqual({ dia: 12, mes: 3, anio: 1950 });
    expect(leer("marzo de 1950")).toEqual({ dia: null, mes: 3, anio: 1950 });
  });
  it("lee solo el año", () => {
    expect(leer("nací en 1950")).toEqual({ dia: null, mes: null, anio: 1950 });
    expect(leer("nació en el 50")).toEqual({ dia: null, mes: null, anio: 1950 });
  });
  it("lee día y mes sin año", () => {
    expect(leer("12/3")).toEqual({ dia: 12, mes: 3, anio: null });
  });
  it("no inventa nada con una edad o texto sin fecha", () => {
    expect(leer("tiene 78 años")).toEqual({ dia: null, mes: null, anio: null });
    expect(leer("Mamá")).toEqual({ dia: null, mes: null, anio: null });
  });
});

describe("leerEdad", () => {
  it("lee edades", () => {
    expect(leerEdad("tiene 78 años")).toBe(78);
    expect(leerEdad("78")).toBe(78);
    expect(leerEdad("12/3/1950")).toBeNull();
  });
});

describe("resolverNacimiento", () => {
  it("fecha completa con edad calculada", () => {
    expect(resolverNacimiento({ dia: 12, mes: 3, anio: 1950 }, null, HOY)).toEqual({ tipo: "fecha", fecha: "1950-03-12", edad: 76 });
  });
  it("la edad respeta si ya cumplió este año", () => {
    expect(edadDesdeFecha("1950-11-06", HOY)).toBe(76);
    expect(edadDesdeFecha("1950-11-07", HOY)).toBe(75);
  });
  it("solo el año", () => {
    expect(resolverNacimiento({ dia: null, mes: null, anio: 1950 }, null, HOY)).toEqual({ tipo: "solo-anio", anio: 1950, edad: 76 });
  });
  it("solo la edad", () => {
    expect(resolverNacimiento({ dia: null, mes: null, anio: null }, 78, HOY)).toEqual({ tipo: "solo-edad", edad: 78 });
  });
  it("sin datos", () => {
    expect(resolverNacimiento({ dia: null, mes: null, anio: null }, null, HOY)).toEqual({ tipo: "nada" });
  });
  it("rechaza fechas irreales, futuras y edades imposibles", () => {
    expect(resolverNacimiento({ dia: 31, mes: 2, anio: 1950 }, null, HOY)).toEqual({ tipo: "invalido", motivo: "fecha-irreal" });
    expect(resolverNacimiento({ dia: 29, mes: 2, anio: 1951 }, null, HOY)).toEqual({ tipo: "invalido", motivo: "fecha-irreal" });
    expect(resolverNacimiento({ dia: 13, mes: 13, anio: 1950 }, null, HOY)).toEqual({ tipo: "invalido", motivo: "fecha-irreal" });
    expect(resolverNacimiento({ dia: 7, mes: 11, anio: 2026 }, null, HOY)).toEqual({ tipo: "invalido", motivo: "futuro" });
    expect(resolverNacimiento({ dia: null, mes: null, anio: 2030 }, null, HOY)).toEqual({ tipo: "invalido", motivo: "futuro" });
    expect(resolverNacimiento({ dia: 1, mes: 1, anio: 1850 }, null, HOY)).toEqual({ tipo: "invalido", motivo: "edad-imposible" });
    expect(resolverNacimiento({ dia: null, mes: null, anio: null }, 200, HOY)).toEqual({ tipo: "invalido", motivo: "edad-imposible" });
  });
  it("acepta el 29/2 de un año bisiesto", () => {
    expect(resolverNacimiento({ dia: 29, mes: 2, anio: 1952 }, null, HOY)).toMatchObject({ tipo: "fecha", fecha: "1952-02-29" });
  });
  it("completa el año con día, mes y edad", () => {
    // 12/3 con 76 años a nov 2026: ya cumplió -> 1950.
    expect(resolverNacimiento({ dia: 12, mes: 3, anio: null }, 76, HOY)).toMatchObject({ tipo: "fecha", fecha: "1950-03-12" });
    // 12/12 con 76 años a nov 2026: todavía no cumplió -> 1949.
    expect(resolverNacimiento({ dia: 12, mes: 12, anio: null }, 76, HOY)).toMatchObject({ tipo: "fecha", fecha: "1949-12-12" });
  });
  it("pide confirmar edades por encima de 120", () => {
    expect(requiereConfirmarEdad(resolverNacimiento({ dia: null, mes: null, anio: 1900 }, null, HOY))).toBe(true);
    expect(requiereConfirmarEdad(resolverNacimiento({ dia: null, mes: null, anio: 1950 }, null, HOY))).toBe(false);
  });
});

describe("combinarPartes", () => {
  it("el año dicho antes se completa con día y mes dichos después", () => {
    const base = leer("nació en 1950");
    expect(combinarPartes(base, leer("12/3"))).toEqual({ dia: 12, mes: 3, anio: 1950 });
  });
});

describe("esCumpleHoy", () => {
  it("coincide día y mes", () => {
    expect(esCumpleHoy("1950-11-06", HOY)).toBe(true);
    expect(esCumpleHoy("1950-11-07", HOY)).toBe(false);
    expect(esCumpleHoy(null, HOY)).toBe(false);
  });
  it("29 de febrero se celebra el 28 en años no bisiestos", () => {
    expect(esCumpleHoy("1952-02-29", "2027-02-28")).toBe(true);
    expect(esCumpleHoy("1952-02-29", "2027-03-01")).toBe(false);
    expect(esCumpleHoy("1952-02-29", "2028-02-28")).toBe(false);
    expect(esCumpleHoy("1952-02-29", "2028-02-29")).toBe(true);
  });
  it("no festeja antes de nacer", () => {
    expect(esCumpleHoy("2030-11-06", HOY)).toBe(false);
  });
  it("calcula los años que cumple", () => {
    expect(edadQueCumple("1950-11-06", HOY)).toBe(76);
    expect(edadQueCumple("1950-11-07", HOY)).toBeNull();
  });
});

describe("textoDeNacimiento", () => {
  it("precarga un campo con lo ya leído", async () => {
    const { textoDeNacimiento } = await import("./nacimiento");
    expect(textoDeNacimiento({ tipo: "fecha", fecha: "1950-03-12", edad: 76 })).toBe("12/3/1950");
    expect(textoDeNacimiento({ tipo: "solo-anio", anio: 1950, edad: 76 })).toBe("1950");
    expect(textoDeNacimiento({ tipo: "solo-edad", edad: 78 })).toBe("78 años");
    expect(textoDeNacimiento({ tipo: "nada" })).toBe("");
  });
});
