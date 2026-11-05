import { describe, expect, it, vi } from "vitest";
// `nucleo.ts` importa `server-only`; la lógica bajo prueba es pura.
vi.mock("server-only", () => ({}));

import { estadoDeToma, filasTomas, type TomaEntrada } from "./estado-toma";

const t = (id: string, hora: string, tomado = false): TomaEntrada => ({ id, nombre: id, dosis: "50 mg", hora, tomado });

describe("estadoDeToma", () => {
  it("tomada gana siempre, incluso antes de hora", () => {
    expect(estadoDeToma(true, "21:00", "08:00")).toBe("tomada");
  });
  it("sin confirmar si ya pasó la hora", () => {
    expect(estadoDeToma(false, "08:00", "09:30")).toBe("sin-confirmar");
  });
  it("sin confirmar justo a la hora", () => {
    expect(estadoDeToma(false, "08:00", "08:00")).toBe("sin-confirmar");
  });
  it("más tarde si todavía no llegó", () => {
    expect(estadoDeToma(false, "21:00", "17:00")).toBe("mas-tarde");
  });
});

describe("filasTomas", () => {
  it("ordena por hora y pone primero lo de ayer, siempre sin confirmar", () => {
    const filas = filasTomas([t("b", "21:00"), t("a", "08:00", true)], [t("z", "22:00")], "17:00");
    expect(filas.map((f) => [f.id, f.estado, f.deAyer])).toEqual([
      ["z", "sin-confirmar", true],
      ["a", "tomada", false],
      ["b", "mas-tarde", false],
    ]);
  });
  it("sin tomas devuelve vacío", () => {
    expect(filasTomas([], [], "10:00")).toEqual([]);
  });
});
