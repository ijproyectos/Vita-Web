import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { frasePorAhoraSoloVos } = await import("./formato");

describe("frasePorAhoraSoloVos", () => {
  it("usa el género del perfil y si no, neutro", () => {
    expect(frasePorAhoraSoloVos("Femenino")).toMatch(/^Por ahora sos la única\./);
    expect(frasePorAhoraSoloVos("Masculino")).toMatch(/^Por ahora sos el único\./);
    for (const g of [null, undefined, "No binario", "Prefiero no decirlo", "Otro"]) {
      expect(frasePorAhoraSoloVos(g)).toMatch(/^Por ahora solo estás vos\./);
    }
  });
});
