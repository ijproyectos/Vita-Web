import { describe, expect, it } from "vitest";
import { fechaEnAR, minutosDelDia } from "./tiempo-ar";

describe("tiempo-ar", () => {
  it("fechaEnAR usa el día de Argentina, no el de UTC", () => {
    // 01:30 UTC del 11 = 22:30 AR del 10.
    expect(fechaEnAR(new Date("2026-11-11T01:30:00Z"))).toBe("2026-11-10");
    expect(fechaEnAR(new Date("2026-11-11T03:00:00Z"))).toBe("2026-11-11");
  });
  it("minutosDelDia", () => {
    expect(minutosDelDia("08:30")).toBe(510);
    expect(minutosDelDia("8:05")).toBe(485);
    expect(minutosDelDia("21:00:00")).toBe(1260);
  });
});
