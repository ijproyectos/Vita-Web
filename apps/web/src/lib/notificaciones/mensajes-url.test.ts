import { describe, expect, it } from "vitest";
import { urlFichaPersona } from "./mensajes";

describe("urlFichaPersona", () => {
  it("Admin o rol desconocido: la ficha de la persona", () => {
    expect(urlFichaPersona("p1", "editar")).toBe("/app/familia/p1");
    expect(urlFichaPersona("p1")).toBe("/app/familia/p1");
    expect(urlFichaPersona("p1", null)).toBe("/app/familia/p1");
  });
  it("Lector: una ruta alcanzable en solo mirar", () => {
    expect(urlFichaPersona("p1", "ver")).toBe("/app");
  });
});
