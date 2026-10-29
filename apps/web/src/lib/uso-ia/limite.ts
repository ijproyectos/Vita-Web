// Límite diario de IA por usuario, en dólares. Módulo puro (sin `server-only`).
//
// Presupuesto del dueño: US$10 por usuario por mes = US$0,33 por día. Constante
// en código (no env var), versionada junto a la lógica que la aplica.

export const LIMITE_USD_DIARIO = 0.33;
export const LIMITE_MICRO_USD_DIARIO = Math.round(LIMITE_USD_DIARIO * 1_000_000); // 330.000

// Límite histórico en tokens (013). Equivale a LIMITE_USD_DIARIO cuando la
// migración 036 todavía no está aplicada y solo existen las columnas de tokens.
export const LIMITE_TOKENS_LEGACY = 200_000;

/** Estimación de micro-USD a partir de tokens viejos (input + output): 200k tokens ~ US$0,33. */
export function microDesdeTokensLegacy(tokens: number): number {
  const t = typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  return Math.round((t * LIMITE_MICRO_USD_DIARIO) / LIMITE_TOKENS_LEGACY);
}

/** ¿Ya alcanzó (>=) el tope del día? */
export function superaLimite(microUsd: number): boolean {
  return microUsd >= LIMITE_MICRO_USD_DIARIO;
}

type Fila = {
  costo_micro_usd?: number | string | null;
  tokens_input?: number | string | null;
  tokens_output?: number | string | null;
} | null;

/** Gasto del día en micro-USD desde una fila de uso_ia_diario (con o sin las columnas de 036). */
export function microUsdDeFila(fila: Fila | undefined, tieneCosto: boolean): number {
  if (!fila) return 0;
  if (tieneCosto) return Number(fila.costo_micro_usd ?? 0) || 0;
  return microDesdeTokensLegacy((Number(fila.tokens_input ?? 0) || 0) + (Number(fila.tokens_output ?? 0) || 0));
}
