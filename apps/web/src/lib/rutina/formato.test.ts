import { afterEach, describe, expect, it, vi } from "vitest";
import {
  descripcionAhoraEnAR,
  diaYMes,
  etiquetaDia,
  fechaConOffset,
  fechaDeHoyISO,
  fechaISOEnAR,
  fechaLargaEnAR,
  formatoFechaCorta,
  saludoEnAR,
} from "./formato";

// Argentina es UTC-3 todo el año (sin horario de verano), así que los instantes
// UTC fijos de abajo dan siempre la misma hora AR sin importar el TZ del equipo.
// Las fechas "YYYY-MM-DDT00:00:00" sin zona se interpretan en hora local del
// proceso, y getDay()/getDate() también son locales: consistente en cualquier TZ.

afterEach(() => {
  vi.useRealTimers();
});

describe("formatoFechaCorta / diaYMes", () => {
  it("formatea día de semana, número y mes", () => {
    expect(formatoFechaCorta("2026-04-21")).toBe("mar 21 abr");
    expect(formatoFechaCorta("2026-12-06")).toBe("dom 6 dic");
  });
  it("fecha inválida se devuelve tal cual", () => {
    expect(formatoFechaCorta("basura")).toBe("basura");
  });
  it("diaYMes con mes en mayúsculas", () => {
    expect(diaYMes("2026-04-21")).toEqual({ dia: "21", mes: "ABR" });
    expect(diaYMes("2026-01-05")).toEqual({ dia: "5", mes: "ENE" });
  });
  it("diaYMes inválido", () => {
    expect(diaYMes("nope")).toEqual({ dia: "—", mes: "" });
  });
});

describe("fechaISOEnAR", () => {
  it("23:30 AR del 10 (02:30Z del 11) sigue siendo el día 10", () => {
    expect(fechaISOEnAR(new Date("2026-10-11T02:30:00Z"))).toBe("2026-10-10");
  });
  it("00:00 AR cambia de día (03:00Z)", () => {
    expect(fechaISOEnAR(new Date("2026-10-11T02:59:59Z"))).toBe("2026-10-10");
    expect(fechaISOEnAR(new Date("2026-10-11T03:00:00Z"))).toBe("2026-10-11");
  });
  it("cruza fin de año", () => {
    expect(fechaISOEnAR(new Date("2027-01-01T02:59:00Z"))).toBe("2026-12-31");
  });
});

describe("fechaDeHoyISO / fechaConOffset / etiquetaDia", () => {
  it("usan el reloj del sistema en hora AR", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T02:30:00Z")); // 23:30 AR del 10
    expect(fechaDeHoyISO()).toBe("2026-10-10");
    expect(fechaConOffset(0)).toBe("2026-10-10");
    expect(fechaConOffset(1)).toBe("2026-10-11");
    expect(fechaConOffset(-1)).toBe("2026-10-09");
  });

  it("etiquetaDia: Hoy / Mañana / día abreviado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    expect(etiquetaDia("2026-10-10")).toBe("Hoy");
    expect(etiquetaDia("2026-10-11")).toBe("Mañana");
    expect(etiquetaDia("2026-10-16")).toBe("Vie 16");
    expect(etiquetaDia("2026-10-05")).toBe("Lun 05");
    expect(etiquetaDia("basura")).toBe("basura");
  });
});

describe("saludoEnAR", () => {
  it.each([
    ["2026-10-10T08:59:00Z", "Buen día"], // 05:59 AR
    ["2026-10-10T14:59:00Z", "Buen día"], // 11:59 AR
    ["2026-10-10T15:00:00Z", "Buenas tardes"], // 12:00 AR
    ["2026-10-10T21:59:00Z", "Buenas tardes"], // 18:59 AR
    ["2026-10-10T22:00:00Z", "Buenas noches"], // 19:00 AR
    ["2026-10-10T03:00:00Z", "Buen día"], // 00:00 AR
  ])("%s -> %s", (iso, esperado) => {
    expect(saludoEnAR(new Date(iso))).toBe(esperado);
  });
});

describe("fechaLargaEnAR / descripcionAhoraEnAR", () => {
  it("fecha larga con día de la semana en español", () => {
    expect(fechaLargaEnAR(new Date("2026-05-02T15:00:00Z"))).toBe("sábado 2 de mayo");
  });
  it("usa el día AR, no el UTC", () => {
    // 01:00Z del domingo 11 = 22:00 AR del sábado 10
    expect(fechaLargaEnAR(new Date("2026-10-11T01:00:00Z"))).toBe("sábado 10 de octubre");
  });
  it("descripción incluye fecha y hora AR", () => {
    const d = descripcionAhoraEnAR(new Date("2026-10-11T23:56:00Z")); // 20:56 AR
    expect(d).toContain("domingo");
    expect(d).toContain("11");
    expect(d).toContain("octubre");
    expect(d).toContain("2026");
    expect(d).toMatch(/08:56/); // 12 h con "p. m." según ICU: no se asume el sufijo
  });
});
