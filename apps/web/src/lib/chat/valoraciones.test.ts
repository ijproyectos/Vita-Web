import { describe, expect, it } from "vitest";
import { esMotivoValido, faltaTablaValoraciones } from "./valoraciones";

describe("valoraciones del chat", () => {
  it("acepta solo los motivos de la lista", () => {
    expect(esMotivoValido("Muy lenta")).toBe(true);
    expect(esMotivoValido("cualquier cosa")).toBe(false);
    expect(esMotivoValido(undefined)).toBe(false);
  });
  it("detecta la tabla ausente", () => {
    expect(faltaTablaValoraciones({ code: "42P01" })).toBe(true);
    expect(faltaTablaValoraciones({ code: "PGRST205" })).toBe(true);
    expect(faltaTablaValoraciones({ code: "23505", message: "duplicate" })).toBe(false);
    expect(faltaTablaValoraciones(null)).toBe(false);
  });
});
