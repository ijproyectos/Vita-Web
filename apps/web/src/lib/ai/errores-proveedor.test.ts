import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { clasificarErrorProveedor, mensajeErrorProveedor } from "./errores-proveedor";

const api = (status: number) => Anthropic.APIError.generate(status, { type: "error" }, "mensaje con datos", new Headers());

describe("clasificarErrorProveedor", () => {
  it("clases tipadas del SDK", () => {
    expect(clasificarErrorProveedor(new Anthropic.APIConnectionTimeoutError())).toBe("timeout");
    expect(clasificarErrorProveedor(new Anthropic.APIConnectionError({ message: "x" }))).toBe("conexion");
    expect(clasificarErrorProveedor(api(429))).toBe("limite");
    expect(clasificarErrorProveedor(api(529))).toBe("sobrecarga");
    expect(clasificarErrorProveedor(api(500))).toBe("servidor");
    expect(clasificarErrorProveedor(api(503))).toBe("servidor");
  });
  it("lo demás es otro", () => {
    expect(clasificarErrorProveedor(api(400))).toBe("otro");
    expect(clasificarErrorProveedor(new Error("boom"))).toBe("otro");
    expect(clasificarErrorProveedor(null)).toBe("otro");
  });
  it("el mensaje al usuario nunca trae el texto crudo", () => {
    for (const c of ["limite", "sobrecarga", "servidor", "timeout", "conexion", "otro"] as const) {
      const m = mensajeErrorProveedor(c);
      expect(m.length).toBeGreaterThan(10);
      expect(m).not.toContain("mensaje con datos");
    }
  });
});
