import { describe, expect, it } from "vitest";
import { confirmoPorVoz } from "./confirmacion-voz";

describe("confirmoPorVoz", () => {
  it.each(["Sí.", "Sí, ya la tomé", "si", "Ya está", "Listo", "Ya las tomé.", "Tomé", "Sí, sí, tomada", "Dale, ya la tomé"])("confirma: %s", (t) => {
    expect(confirmoPorVoz(t)).toBe(true);
  });

  it.each([
    "No",
    "No, todavía no",
    "No sé si la tomé",
    "No la tome",
    "Todavía no la tomé",
    "Más tarde",
    "Después",
    "Me olvidé",
    "Esperá un poco",
    "",
    "Hola vita",
    "¿Qué tengo que tomar?",
  ])("no confirma: %s", (t) => {
    expect(confirmoPorVoz(t)).toBe(false);
  });
});
