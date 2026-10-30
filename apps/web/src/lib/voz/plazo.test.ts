import { afterEach, describe, expect, it, vi } from "vitest";
import { conPlazo } from "./plazo";

afterEach(() => vi.useRealTimers());

describe("conPlazo", () => {
  it("returns the value when the promise settles in time", async () => {
    vi.useFakeTimers();
    await expect(conPlazo(Promise.resolve(7), 1500)).resolves.toBe(7);
  });

  it("gives up with undefined when the promise never settles (iOS resume without gesture)", async () => {
    vi.useFakeTimers();
    const r = conPlazo(new Promise<void>(() => {}), 1500);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(r).resolves.toBeUndefined();
  });

  it("swallows rejections", async () => {
    await expect(conPlazo(Promise.reject(new Error("x")), 1500)).resolves.toBeUndefined();
  });
});
