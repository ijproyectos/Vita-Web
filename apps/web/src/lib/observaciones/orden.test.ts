import { describe, expect, it } from "vitest";
import { observacionesVisibles, ordenarObservaciones } from "./orden";

describe("ordenarObservaciones", () => {
  it("atención primero y después la más nueva", () => {
    const lista = [
      { id: "a", severidad: "info" as const, creada_at: "2026-11-18T10:00:00Z" },
      { id: "b", severidad: "atencion" as const, creada_at: "2026-11-10T10:00:00Z" },
      { id: "c", severidad: "info" as const, creada_at: "2026-11-18T12:00:00Z" },
      { id: "d", severidad: "atencion" as const, creada_at: "2026-11-17T10:00:00Z" },
    ];
    expect(ordenarObservaciones(lista).map((o) => o.id)).toEqual(["d", "b", "c", "a"]);
    expect(lista[0].id).toBe("a"); // no muta
  });
});

describe("observacionesVisibles", () => {
  it("saca las vencidas y las descartadas", () => {
    const ahora = Date.parse("2026-11-18T12:00:00Z");
    const lista = [
      { id: "ok", vigente_hasta: "2026-11-19T00:00:00Z", descartada_at: null },
      { id: "vencida", vigente_hasta: "2026-11-18T11:59:59Z", descartada_at: null },
      { id: "descartada", vigente_hasta: "2026-11-30T00:00:00Z", descartada_at: "2026-11-18T09:00:00Z" },
    ];
    expect(observacionesVisibles(lista, ahora).map((o) => o.id)).toEqual(["ok"]);
  });
});
