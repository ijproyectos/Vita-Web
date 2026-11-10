import { describe, expect, it } from "vitest";
import { verboAvisa } from "./destinatario";

describe("verboAvisa", () => {
  it("a la cuenta logueada le habla de vos", () => {
    expect(verboAvisa()).toBe("te avisa");
    expect(verboAvisa("  ")).toBe("te avisa");
  });

  it("para otra persona la nombra", () => {
    expect(verboAvisa("Jesús")).toBe("le avisa a Jesús");
  });
});
