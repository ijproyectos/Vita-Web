import { describe, expect, it } from "vitest";
import {
  calcularVersionPrompt,
  clasificarError,
  construirFilaRegistro,
  contarEscrituras,
  medicionInicial,
} from "./registros-logica";

describe("calcularVersionPrompt", () => {
  it("es estable y de 12 hex", () => {
    const v = calcularVersionPrompt("prompt", [{ name: "t" }], "modelo");
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(calcularVersionPrompt("prompt", [{ name: "t" }], "modelo")).toBe(v);
  });
  it("cambia con el prompt, las tools o el modelo", () => {
    const base = calcularVersionPrompt("p", [1], "m");
    expect(calcularVersionPrompt("p2", [1], "m")).not.toBe(base);
    expect(calcularVersionPrompt("p", [2], "m")).not.toBe(base);
    expect(calcularVersionPrompt("p", [1], "m2")).not.toBe(base);
  });
});

describe("contarEscrituras", () => {
  it("cuenta solo tools de escritura", () => {
    const w = new Set(["add_medication", "mark_taken"]);
    expect(contarEscrituras(["add_medication", "list_today_medications", "mark_taken", "add_medication"], w)).toBe(3);
    expect(contarEscrituras([], w)).toBe(0);
  });
});

describe("clasificarError", () => {
  it("reconoce errores del SDK sin usar el mensaje", () => {
    expect(clasificarError({ name: "APIConnectionTimeoutError", message: "datos del usuario" })).toBe("timeout");
    expect(clasificarError({ name: "APIUserAbortError" })).toBe("stream_abort");
    expect(clasificarError({ name: "APIConnectionError" })).toBe("anthropic_conexion");
    expect(clasificarError({ status: 529 })).toBe("anthropic_529");
  });
  it("db, stream e interno", () => {
    expect(clasificarError({ code: "42P01", details: "x", message: "m" })).toBe("db");
    expect(clasificarError(new TypeError("Controller is already closed"))).toBe("stream_abort");
    expect(clasificarError(new Error("lo que sea"))).toBe("interno");
    expect(clasificarError(null)).toBe("interno");
    expect(clasificarError("texto")).toBe("interno");
  });
  it("nunca devuelve el mensaje crudo", () => {
    expect(clasificarError(new Error("Ana toma metformina"))).not.toContain("Ana");
  });
});

describe("construirFilaRegistro", () => {
  it("arma la fila redondeando y sin texto del usuario", () => {
    const m = medicionInicial();
    m.sesionId = "s1";
    m.vueltas = 2;
    m.tools = ["add_medication", "set_avatar_mood"];
    m.primerTokenMs = 412.6;
    m.tokensEntrada = 100;
    m.tokensSalida = 20;
    const fila = construirFilaRegistro({
      usuarioId: "u1",
      pedidoId: "p1",
      versionPrompt: "abc",
      modelo: "mod",
      inicioMs: 1000,
      finMs: 3500.4,
      medicion: m,
      toolsDeEscritura: new Set(["add_medication"]),
    });
    expect(fila).toMatchObject({
      usuario_id: "u1",
      pedido_id: "p1",
      sesion_id: "s1",
      latencia_ms: 2500,
      latencia_primer_token_ms: 413,
      vueltas_modelo: 2,
      tools: ["add_medication", "set_avatar_mood"],
      escrituras: 1,
      tokens_entrada: 100,
      resultado: "ok",
      error_codigo: null,
    });
    expect(Object.keys(fila)).not.toContain("mensaje");
  });
  it("latencias nunca negativas y primer token null", () => {
    const fila = construirFilaRegistro({
      usuarioId: "u",
      pedidoId: null,
      versionPrompt: "v",
      modelo: "m",
      inicioMs: 10,
      finMs: 5,
      medicion: medicionInicial(),
      toolsDeEscritura: new Set(),
    });
    expect(fila.latencia_ms).toBe(0);
    expect(fila.latencia_primer_token_ms).toBeNull();
  });
});
