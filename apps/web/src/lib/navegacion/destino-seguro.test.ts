import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./destino-seguro";

describe("destinoSeguro", () => {
  it("acepta rutas internas con query", () => {
    expect(destinoSeguro("/app/rutina?x=1")).toBe("/app/rutina?x=1");
    expect(destinoSeguro("/cuidar/invitacion/abc")).toBe("/cuidar/invitacion/abc");
  });

  it("cae al default con vacio o nulo", () => {
    expect(destinoSeguro(null)).toBe("/app");
    expect(destinoSeguro(undefined)).toBe("/app");
    expect(destinoSeguro("")).toBe("/app");
  });

  it.each([
    "https://evil.com",
    "http://evil.com/app",
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "/%2F%2Fevil.com",
    "/%5Cevil.com",
    "evil.com",
    "javascript:alert(1)",
    "/app\n//evil.com",
    "/app\t",
    "/%0d%0aevil",
    "/%E0%A4%A",
  ])("rechaza %s", (malo) => {
    expect(destinoSeguro(malo)).toBe("/app");
  });

  it("respeta un default propio", () => {
    expect(destinoSeguro("//x", "/login")).toBe("/login");
  });
});
