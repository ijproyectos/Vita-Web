import { describe, expect, it } from "vitest";
import { clasificarFinDeStream } from "./fin-stream";

describe("clasificarFinDeStream", () => {
  it("treats a stream closed with [DONE] as complete", () => {
    expect(clasificarFinDeStream({ recibioDone: true, huboError: false })).toBe("completo");
  });
  it("treats a stream that ends without [DONE] as interrupted", () => {
    expect(clasificarFinDeStream({ recibioDone: false, huboError: false })).toBe("interrumpido");
  });
  it("does not double-report when an error event was already handled", () => {
    expect(clasificarFinDeStream({ recibioDone: false, huboError: true })).toBe("completo");
  });
});
