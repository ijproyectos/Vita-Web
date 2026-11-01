import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extraerVenta,
  obtenerDolarOficial,
  reiniciarCacheCotizacion,
  TTL_COTIZACION_MS,
  URL_DOLAR_OFICIAL,
} from "./cotizacion";

const respuesta = (cuerpo: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => cuerpo }) as Response;

describe("dólar oficial", () => {
  beforeEach(() => reiniciarCacheCotizacion());

  it("lee `venta` de la API", async () => {
    const fetchImpl = vi.fn(async () => respuesta({ moneda: "USD", casa: "oficial", compra: 1510, venta: 1560 }));
    const r = await obtenerDolarOficial({ fetchImpl, ahoraMs: 1_000 });
    expect(r).toMatchObject({ ok: true, fx: 1560 });
    expect(fetchImpl).toHaveBeenCalledWith(URL_DOLAR_OFICIAL, expect.anything());
  });

  it("cachea unos minutos y vuelve a pedir después", async () => {
    const fetchImpl = vi.fn(async () => respuesta({ venta: 1560 }));
    await obtenerDolarOficial({ fetchImpl, ahoraMs: 0 });
    await obtenerDolarOficial({ fetchImpl, ahoraMs: TTL_COTIZACION_MS - 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await obtenerDolarOficial({ fetchImpl, ahoraMs: TTL_COTIZACION_MS + 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falla (sin inventar un valor) si la API da error HTTP", async () => {
    const r = await obtenerDolarOficial({ fetchImpl: async () => respuesta({}, false), ahoraMs: 0 });
    expect(r).toEqual({ ok: false });
  });

  it("falla si la red se cae o expira", async () => {
    const r = await obtenerDolarOficial({
      fetchImpl: async () => {
        throw new Error("red");
      },
      ahoraMs: 0,
    });
    expect(r).toEqual({ ok: false });
  });

  it("falla si el valor es insensato o falta, y no lo cachea", async () => {
    for (const cuerpo of [{ venta: 5 }, { venta: 1e9 }, { venta: "1560" }, {}, null]) {
      reiniciarCacheCotizacion();
      const r = await obtenerDolarOficial({ fetchImpl: async () => respuesta(cuerpo), ahoraMs: 0 });
      expect(r).toEqual({ ok: false });
    }
    const buena = await obtenerDolarOficial({ fetchImpl: async () => respuesta({ venta: 1560 }), ahoraMs: 0 });
    expect(buena.ok).toBe(true);
  });

  it("extraerVenta valida la forma", () => {
    expect(extraerVenta({ venta: 1560 })).toBe(1560);
    expect(extraerVenta("x")).toBeNull();
  });
});
