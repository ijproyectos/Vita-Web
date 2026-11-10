import { describe, expect, it } from "vitest";
import { consultaMapa, urlMapaEmbebido } from "./mapa";

describe("consultaMapa", () => {
  it("junta lugar y dirección", () => {
    expect(consultaMapa("Sanatorio Norte", "Av. Cabildo 2450")).toBe("Sanatorio Norte, Av. Cabildo 2450");
  });

  it("usa lo que haya y no repite", () => {
    expect(consultaMapa("  Hospital Italiano ", "")).toBe("Hospital Italiano");
    expect(consultaMapa("", "Av. Cabildo 2450")).toBe("Av. Cabildo 2450");
    expect(consultaMapa("Cabildo 2450", "Cabildo 2450")).toBe("Cabildo 2450");
  });

  it("muy corto o vacío no busca", () => {
    expect(consultaMapa("ab")).toBeNull();
    expect(consultaMapa(null, null)).toBeNull();
  });
});

describe("urlMapaEmbebido", () => {
  it("sin clave usa el embed público, con la búsqueda codificada", () => {
    expect(urlMapaEmbebido("Av. Cabildo 2450")).toBe("https://maps.google.com/maps?q=Av.%20Cabildo%202450&z=16&hl=es&output=embed");
  });

  it("con clave usa la Embed API oficial", () => {
    const url = urlMapaEmbebido("Hospital Italiano", "CLAVE");
    expect(url).toContain("https://www.google.com/maps/embed/v1/place?key=CLAVE");
    expect(url).toContain("q=Hospital%20Italiano");
  });
});
