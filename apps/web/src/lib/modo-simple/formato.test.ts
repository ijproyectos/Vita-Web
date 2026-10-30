import { afterEach, describe, expect, it, vi } from "vitest";
import { horaActualEnAR } from "./formato";

afterEach(() => vi.restoreAllMocks());

describe("horaActualEnAR", () => {
  it("formats just after midnight AR as 00:MM, never 24:MM", () => {
    expect(horaActualEnAR(new Date("2026-10-29T03:15:00Z"))).toBe("00:15");
  });

  it("formats an afternoon hour", () => {
    expect(horaActualEnAR(new Date("2026-10-29T17:05:00Z"))).toBe("14:05");
  });

  it("maps an engine's h24 midnight (24:15) to 00:15", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return { format: () => "24:15" } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);
    expect(horaActualEnAR(new Date())).toBe("00:15");
  });
});
