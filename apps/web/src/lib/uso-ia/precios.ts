// Precios oficiales de Anthropic por millón de tokens (USD) y cálculo de costo.
// Módulo puro (sin `server-only`): lo usan el servidor y los tests.
//
// Unidad de contabilidad: MICRO-dólares enteros (1 USD = 1.000.000). Como el
// precio por millón de tokens en USD es numéricamente igual al precio por token
// en micro-USD, `tokens * precioPorMTok` ya da micro-USD sin factor extra. Se
// redondea UNA sola vez por llamada para evitar deriva de floats al acumular.

export type PreciosModelo = {
  /** USD por 1M de tokens de entrada sin cache. */
  input: number;
  /** USD por 1M de tokens de salida. */
  output: number;
  /** USD por 1M de tokens leídos de cache (0,1x el input). */
  cacheRead: number;
  /** USD por 1M de tokens escritos a cache con TTL de 5 min (1,25x el input). */
  cacheWrite: number;
};

export type UsoTokens = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

// Sonnet 5 y 5.5 comparten precios: $2 / $10, lectura de cache $0,20, escritura 5 min = 1,25 x input.
const SONNET: PreciosModelo = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

// Haiku 5.5, tramo de prompts de hasta 100.000 tokens: $0,10 / $0,50, escritura de cache 5 min $0,125, lectura $0,01.
// Fuente: https://platform.claude.com/docs/en/about-claude/pricing (verificado 2026-10-30). Por encima de 100.000
// tokens de prompt el precio es 5x; el resumen nunca se acerca (su entrada está acotada a ~12k tokens).
const HAIKU_5_5: PreciosModelo = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

export const PRECIOS_POR_MODELO: Readonly<Record<string, PreciosModelo>> = {
  "claude-sonnet-5": SONNET,
  "claude-sonnet-5-5": SONNET,
  "claude-haiku-5-5": HAIKU_5_5,
};

function costoPorMillon(p: PreciosModelo): number {
  return p.input + p.output + p.cacheRead + p.cacheWrite;
}

/** Precio del modelo; si no se conoce, el más caro conocido (falla seguro: nunca cero). */
export function preciosDe(modelo: string): PreciosModelo {
  const exacto = PRECIOS_POR_MODELO[modelo];
  if (exacto) return exacto;
  return Object.values(PRECIOS_POR_MODELO).reduce((max, p) => (costoPorMillon(p) > costoPorMillon(max) ? p : max));
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Costo de una llamada en micro-USD enteros. */
export function costoMicroUSD(modelo: string, uso: UsoTokens): number {
  const p = preciosDe(modelo);
  return Math.round(n(uso.input) * p.input + n(uso.output) * p.output + n(uso.cacheRead) * p.cacheRead + n(uso.cacheWrite) * p.cacheWrite);
}

/** Costo de una llamada en dólares (solo para mostrar o loguear; la contabilidad usa micro-USD). */
export function costoUSD(modelo: string, uso: UsoTokens): number {
  return costoMicroUSD(modelo, uso) / 1_000_000;
}
