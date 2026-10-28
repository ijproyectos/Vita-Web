import { describe, expect, it } from "vitest";
import { RUTA_MONITOREO, volverSeguro } from "./tipos";

describe("volverSeguro", () => {
  it.each(["/app", "/app/rutina", "/app/mi-salud/monitoreo?tipo=peso", "/app/a/b_c-d"])("acepta %j", (v) => {
    expect(volverSeguro(v)).toBe(v);
  });

  it.each([
    "//evil.com",
    "/app//evil",
    "http://evil.com",
    "https://evil.com/app",
    "/appfoo",
    "/app/../x",
    "javascript:alert(1)",
    "/login",
    "app/rutina",
    "",
    "/app/x\\evil",
  ])("rechaza %j", (v) => {
    expect(volverSeguro(v)).toBe(RUTA_MONITOREO);
  });

  it("rechaza no-strings", () => {
    expect(volverSeguro(undefined)).toBe(RUTA_MONITOREO);
    expect(volverSeguro(["/app"])).toBe(RUTA_MONITOREO);
    expect(volverSeguro(null)).toBe(RUTA_MONITOREO);
  });
});
