import { describe, expect, it } from "vitest";
import { medidoAtDesdeModelo } from "./mapeo";
import { claveSemantica } from "@/lib/chat/clave";

describe("medidoAtDesdeModelo", () => {
  it("sin valor es undefined (se guarda con la hora de ahora)", () => {
    expect(medidoAtDesdeModelo(undefined)).toBeUndefined();
    expect(medidoAtDesdeModelo("  ")).toBeUndefined();
  });

  it("pasa la hora de Argentina a ISO con zona", () => {
    expect(medidoAtDesdeModelo("2026-11-10T09:30")).toBe("2026-11-10T09:30:00-03:00");
    expect(medidoAtDesdeModelo("2026-11-10 21:05")).toBe("2026-11-10T21:05:00-03:00");
  });

  it("rechaza otros formatos", () => {
    expect(medidoAtDesdeModelo("ayer a la mañana")).toBe("invalida");
    expect(medidoAtDesdeModelo("2026-13-40T99:99")).toBe("invalida");
    expect(medidoAtDesdeModelo(1234)).toBe("invalida");
    expect(medidoAtDesdeModelo("2026-02-30T09:00")).toBe("invalida");
    expect(medidoAtDesdeModelo("2026-11-10T24:00")).toBe("invalida");
  });
});

describe("claveSemantica de add_measurement", () => {
  it("no depende de persona_id ni de confirmado (la confirmación tiene que coincidir con lo preguntado)", () => {
    const base = { type: "presion", value: 130, secondary_value: 80 };
    expect(claveSemantica("add_measurement", { ...base, persona_id: "p1", confirmado: true })).toBe(claveSemantica("add_measurement", base));
  });

  it("dos valores distintos son dos acciones", () => {
    expect(claveSemantica("add_measurement", { type: "presion", value: 130, secondary_value: 80 })).not.toBe(
      claveSemantica("add_measurement", { type: "presion", value: 140, secondary_value: 90 })
    );
  });
});
