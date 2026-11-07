import { describe, expect, it } from "vitest";
import { armarPagina, dentroDeVentana, diaEnAR, elegirSesionActiva, etiquetaDiaChat, inicioVentanaChat, separadorAntes } from "./hilo";

// 2026-11-06 15:00 AR = 18:00 UTC
const AHORA = Date.UTC(2026, 10, 6, 18, 0, 0);

describe("etiquetaDiaChat", () => {
  it("Hoy / Ayer / día largo, en hora de Argentina", () => {
    expect(etiquetaDiaChat("2026-11-06T12:00:00Z", AHORA)).toBe("Hoy");
    expect(etiquetaDiaChat("2026-11-05T12:00:00Z", AHORA)).toBe("Ayer");
    expect(etiquetaDiaChat("2026-11-02T12:00:00Z", AHORA)).toBe("lunes 2 de noviembre");
  });
  it("las 23:30 AR (02:30 UTC del día siguiente) cuentan como el día AR", () => {
    expect(etiquetaDiaChat("2026-11-06T02:30:00Z", AHORA)).toBe("Ayer");
    expect(diaEnAR("2026-11-06T02:30:00Z")).toBe("2026-11-05");
  });
  it("cruza el fin de mes y de año para Ayer", () => {
    const ahora = Date.UTC(2027, 0, 1, 15, 0, 0);
    expect(etiquetaDiaChat("2026-12-31T15:00:00Z", ahora)).toBe("Ayer");
  });
  it("fecha inválida -> vacío", () => {
    expect(etiquetaDiaChat("nada", AHORA)).toBe("");
  });
});

describe("separadorAntes", () => {
  it("el primero siempre lleva separador", () => {
    expect(separadorAntes(null, "2026-11-06T12:00:00Z", AHORA)).toBe("Hoy");
  });
  it("mismo día no lo repite y otro día sí", () => {
    expect(separadorAntes("2026-11-06T12:00:00Z", "2026-11-06T13:00:00Z", AHORA)).toBeNull();
    expect(separadorAntes("2026-11-05T12:00:00Z", "2026-11-06T13:00:00Z", AHORA)).toBe("Hoy");
  });
});

describe("ventana de 7 días", () => {
  it("inicio y pertenencia", () => {
    expect(inicioVentanaChat(AHORA)).toBe("2026-10-30T18:00:00.000Z");
    expect(dentroDeVentana("2026-10-30T18:00:00.000Z", AHORA)).toBe(true);
    expect(dentroDeVentana("2026-10-30T17:59:59.000Z", AHORA)).toBe(false);
    expect(dentroDeVentana("x", AHORA)).toBe(false);
  });
});

describe("armarPagina", () => {
  const filas = [5, 4, 3, 2, 1].map((n) => ({ id: String(n), created_at: `2026-11-0${n}T00:00:00Z` }));
  it("con una fila de más hay más viejas y devuelve cronológico", () => {
    const p = armarPagina(filas.slice(0, 4), 3);
    expect(p.hayMas).toBe(true);
    expect(p.mensajes.map((m) => m.id)).toEqual(["3", "4", "5"]);
  });
  it("sin sobrante no hay más", () => {
    const p = armarPagina(filas.slice(0, 3), 3);
    expect(p.hayMas).toBe(false);
    expect(p.mensajes.map((m) => m.id)).toEqual(["3", "4", "5"]);
  });
  it("vacío", () => {
    expect(armarPagina([], 3)).toEqual({ mensajes: [], hayMas: false });
  });
});

describe("elegirSesionActiva", () => {
  it("reutiliza la creada más recientemente", () => {
    const s = [
      { id: "a", created_at: "2026-11-01T00:00:00Z" },
      { id: "b", created_at: "2026-11-05T00:00:00Z" },
    ];
    expect(elegirSesionActiva(s)?.id).toBe("b");
  });
  it("sin sesiones -> null (hay que crear una)", () => {
    expect(elegirSesionActiva([])).toBeNull();
  });
});
