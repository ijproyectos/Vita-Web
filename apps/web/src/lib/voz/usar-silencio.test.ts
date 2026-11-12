import { describe, expect, it } from "vitest";
import { silenciadaEfectiva } from "./usar-silencio";

describe("silenciadaEfectiva", () => {
  it("sin elección guardada usa el valor por defecto de la pantalla", () => {
    expect(silenciadaEfectiva("", true)).toBe(true); // modo simple
    expect(silenciadaEfectiva("", false)).toBe(false); // chat normal
  });

  it("una elección guardada gana sobre el valor por defecto", () => {
    expect(silenciadaEfectiva("0", true)).toBe(false);
    expect(silenciadaEfectiva("1", false)).toBe(true);
  });
});
