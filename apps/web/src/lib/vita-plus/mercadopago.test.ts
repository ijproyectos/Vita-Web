import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelarConFallback,
  crearClienteMp,
  leerCreacion,
  reiniciarGrafiaCancelacion,
  urlPreapproval,
  vitaPlusConfigurado,
} from "./mercadopago";

describe("degradación sin credenciales", () => {
  const original = process.env.MP_ACCESS_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.MP_ACCESS_TOKEN;
    else process.env.MP_ACCESS_TOKEN = original;
  });

  it("sin MP_ACCESS_TOKEN vita+ no está configurado (la pantalla queda en 'Muy pronto')", () => {
    delete process.env.MP_ACCESS_TOKEN;
    expect(vitaPlusConfigurado()).toBe(false);
    process.env.MP_ACCESS_TOKEN = "   ";
    expect(vitaPlusConfigurado()).toBe(false);
  });

  it("con token queda configurado", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-123";
    expect(vitaPlusConfigurado()).toBe(true);
  });
});

describe("cancelación con fallback de grafía", () => {
  beforeEach(() => reiniciarGrafiaCancelacion());

  it("reintenta UNA vez con la otra grafía ante un 400 y recuerda la que anduvo", async () => {
    const enviados: string[] = [];
    const r = await cancelarConFallback(async (estado) => {
      enviados.push(estado);
      return { status: estado === "cancelled" ? 200 : 400, json: null };
    });
    expect(enviados).toEqual(["canceled", "cancelled"]);
    expect(r.status).toBe(200);

    const siguiente: string[] = [];
    await cancelarConFallback(async (estado) => {
      siguiente.push(estado);
      return { status: 200, json: null };
    });
    expect(siguiente).toEqual(["cancelled"]);
  });

  it("no reintenta ante otros errores", async () => {
    const enviar = vi.fn(async () => ({ status: 500, json: null }));
    const r = await cancelarConFallback(enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(500);
  });
});

describe("cliente", () => {
  it("manda el token y nunca lanza ante una caída de red", async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const mp = crearClienteMp("tok", async (url, init) => {
      llamadas.push({ url, init });
      throw new Error("red");
    });
    const r = await mp.crearPreapproval({ a: 1 });
    expect(r).toEqual({ status: 0, json: null });
    expect((llamadas[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("leer clasifica el status", async () => {
    const mp = crearClienteMp("tok", async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
    expect(await mp.leer(urlPreapproval("abc"))).toEqual({ clase: "transitorio", json: null });
  });

  it("leerCreacion toma solo id e init_point", () => {
    expect(leerCreacion({ id: "p1", init_point: "https://x", extra: 1 })).toEqual({ id: "p1", initPoint: "https://x" });
    expect(leerCreacion({ init_point: "https://x" })).toBeNull();
  });
});
