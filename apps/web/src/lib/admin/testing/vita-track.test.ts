import { describe, expect, it } from "vitest";
import { urlVitaTrack } from "./vita-track";

describe("urlVitaTrack", () => {
  it("solo acepta https (o http en localhost) y oculta el link sin variable", () => {
    expect(urlVitaTrack(undefined)).toBeNull();
    expect(urlVitaTrack("  ")).toBeNull();
    expect(urlVitaTrack("javascript:alert(1)")).toBeNull();
    expect(urlVitaTrack("http://track.example.com")).toBeNull();
    expect(urlVitaTrack("https://track.example.com")).toBe("https://track.example.com/");
    expect(urlVitaTrack("http://localhost:5173")).toBe("http://localhost:5173/");
  });
});
