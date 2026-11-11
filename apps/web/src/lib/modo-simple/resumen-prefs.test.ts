import { describe, expect, it } from "vitest";
import { resumenPrefsModoSimple } from "./resumen-prefs";

describe("resumenPrefsModoSimple", () => {
  it("dice voz y posponer como el diseño", () => {
    expect(resumenPrefsModoSimple({ voz: true, posponer: true })).toBe("Con voz · puede posponer");
    expect(resumenPrefsModoSimple({ voz: false, posponer: false })).toBe("Sin voz · sin posponer");
  });
});
