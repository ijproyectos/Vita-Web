import { describe, expect, it } from "vitest";
import { costoMicroUSD } from "@/lib/uso-ia/precios";
import {
  contextoTokens,
  costoUsdDeFila,
  desgloseErrores,
  percentil,
  periodoDe,
  porDia,
  porTramoDeContexto,
  porVersion,
  resumir,
  resumirValoraciones,
  topTools,
  type FilaRegistroChat,
} from "./chat-metricas";

function fila(p: Partial<FilaRegistroChat> = {}): FilaRegistroChat {
  return {
    created_at: "2026-11-10T15:00:00.000Z",
    version_prompt: "v1",
    modelo: "claude-sonnet-5",
    latencia_ms: 2000,
    latencia_primer_token_ms: 800,
    tools: [],
    tokens_entrada: 1000,
    tokens_salida: 200,
    tokens_cache_lectura: 9000,
    tokens_cache_escritura: 0,
    resultado: "ok",
    error_codigo: null,
    ...p,
  };
}

describe("percentil", () => {
  it("rango más cercano", () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentil(v, 50)).toBe(50);
    expect(percentil(v, 90)).toBe(90);
    expect(percentil(v, 100)).toBe(100);
    expect(percentil(v, 0)).toBe(10);
  });
  it("ignora nulos y devuelve null sin datos", () => {
    expect(percentil([null, undefined, 5], 90)).toBe(5);
    expect(percentil([], 50)).toBeNull();
    expect(percentil([null], 50)).toBeNull();
  });
});

describe("resumir", () => {
  it("calcula cortes, contexto, caché y costo", () => {
    const filas = [fila(), fila({ error_codigo: "tiempo", latencia_ms: 9000 })];
    const r = resumir(filas);
    expect(r.respuestas).toBe(2);
    expect(r.tasaCorte).toBe(0.5);
    expect(r.contextoPromedio).toBe(10_000);
    expect(r.ratioCache).toBeCloseTo(0.9);
    expect(r.latenciaP90).toBe(9000);
    expect(r.costoPromedioUsd).toBeCloseTo(costoMicroUSD("claude-sonnet-5", { input: 1000, output: 200, cacheRead: 9000, cacheWrite: 0 }) / 1_000_000);
  });
  it("sin filas todo es null", () => {
    const r = resumir([]);
    expect(r.respuestas).toBe(0);
    expect(r.tasaCorte).toBeNull();
    expect(r.costoPromedioUsd).toBeNull();
    expect(r.ratioCache).toBeNull();
  });
  it("el costo de un modelo desconocido nunca es cero", () => {
    expect(costoUsdDeFila(fila({ modelo: "otro-modelo" }))).toBeGreaterThan(0);
  });
});

describe("porTramoDeContexto", () => {
  it("reparte por tramo con su tasa de corte", () => {
    const filas = [
      fila({ tokens_entrada: 5000, tokens_cache_lectura: 0 }),
      fila({ tokens_entrada: 12_000, tokens_cache_lectura: 0, error_codigo: "tiempo" }),
      fila({ tokens_entrada: 20_000, tokens_cache_lectura: 0 }),
      fila({ tokens_entrada: 10_000, tokens_cache_lectura: 15_000, error_codigo: "tiempo" }),
      fila({ tokens_entrada: 10_000, tokens_cache_lectura: 15_000 }),
    ];
    const t = porTramoDeContexto(filas);
    expect(t.map((x) => x.respuestas)).toEqual([1, 1, 1, 2]);
    expect(t[1].tasaCorte).toBe(1);
    expect(t[3].tasaCorte).toBe(0.5);
    expect(t[0].tasaCorte).toBe(0);
    expect(contextoTokens(filas[3])).toBe(25_000);
  });
});

describe("porDia", () => {
  it("agrupa por fecha AR, más reciente primero", () => {
    const filas = [
      fila({ created_at: "2026-11-10T01:00:00.000Z" }), // 9/11 22:00 en AR
      fila({ created_at: "2026-11-10T15:00:00.000Z" }),
      fila({ created_at: "2026-11-11T15:00:00.000Z", error_codigo: "tiempo" }),
    ];
    const d = porDia(filas);
    expect(d.map((x) => x.fecha)).toEqual(["2026-11-11", "2026-11-10", "2026-11-09"]);
    expect(d[0].cortes).toBe(1);
  });
});

describe("topTools, errores y versiones", () => {
  it("cuenta una vez por respuesta y ordena", () => {
    const filas = [fila({ tools: ["a", "a", "b"] }), fila({ tools: ["a"] }), fila({ tools: [] })];
    expect(topTools(filas)).toEqual([
      { nombre: "a", n: 2 },
      { nombre: "b", n: 1 },
    ]);
  });
  it("desglosa códigos de error", () => {
    expect(desgloseErrores([fila({ error_codigo: "tiempo" }), fila({ error_codigo: "tiempo" }), fila({ error_codigo: "red" }), fila()])).toEqual([
      { nombre: "tiempo", n: 2 },
      { nombre: "red", n: 1 },
    ]);
  });
  it("compara por versión, la más reciente primero", () => {
    const v = porVersion([fila({ version_prompt: "v1", created_at: "2026-11-01T10:00:00.000Z" }), fila({ version_prompt: "v2", created_at: "2026-11-05T10:00:00.000Z" })]);
    expect(v.map((x) => x.version)).toEqual(["v2", "v1"]);
  });
});

describe("valoraciones y período", () => {
  it("porcentaje de positivas sobre las valoradas", () => {
    expect(resumirValoraciones([{ valor: 1 }, { valor: 1 }, { valor: -1 }, { valor: 1 }])).toEqual({ total: 4, positivas: 3, negativas: 1, porcentajePositivas: 0.75 });
    expect(resumirValoraciones([]).porcentajePositivas).toBeNull();
  });
  it("período desconocido cae a 7 días", () => {
    expect(periodoDe("30d").horas).toBe(720);
    expect(periodoDe("xx").clave).toBe("7d");
    expect(periodoDe(undefined).clave).toBe("7d");
  });
});
