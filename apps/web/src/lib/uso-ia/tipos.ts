// Tipos y cálculo puro del uso diario de IA — sin `server-only` a propósito,
// para que el cliente (overlay del chat, Perfil) pueda importar el tipo y la
// barra sin arrastrar el cliente `service_role`.

export type UsoDiario = {
  usados: number;
  limite: number;
  restantes: number;
  /** Entero 0–100. */
  porcentajeUsado: number;
};

export type UsoDiarioConEstado = UsoDiario & { agotado: boolean };

export function calcularUso(usados: number, limite: number): UsoDiarioConEstado {
  const restantes = Math.max(0, limite - usados);
  const porcentajeUsado = Math.min(100, Math.max(0, Math.round((usados / limite) * 100)));
  return { usados, limite, restantes, porcentajeUsado, agotado: usados >= limite };
}

// --- Cuenta del límite diario por costo ---------------------------------------------
// El caché de Anthropic cambia lo que cuesta cada token: una escritura en caché (TTL de
// 5 min) se factura ~1.25x y una lectura ~0.1x. El límite diario cuenta tokens PONDERADOS
// por ese costo, así un usuario que lee del caché no gasta su cuota como si fuera input
// nuevo, y una escritura cara tampoco pasa desapercibida.

export const FACTOR_CACHE_ESCRITURA = 1.25;
export const FACTOR_CACHE_LECTURA = 0.1;

/** Uso de una (o varias) llamadas a Anthropic, tal como lo reporta `usage`. */
export type UsoTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};

const entero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Convierte `usage` de la API (campos ausentes/null/inválidos = 0) a `UsoTokens`. */
export function usoDeAnthropic(
  usage:
    | {
        input_tokens?: number | null;
        output_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      }
    | null
    | undefined
): UsoTokens {
  return {
    inputTokens: entero(usage?.input_tokens),
    outputTokens: entero(usage?.output_tokens),
    cacheCreationTokens: entero(usage?.cache_creation_input_tokens),
    cacheReadTokens: entero(usage?.cache_read_input_tokens),
  };
}

export function sumarUso(a: UsoTokens, b: UsoTokens): UsoTokens {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: (a.cacheCreationTokens ?? 0) + (b.cacheCreationTokens ?? 0),
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  };
}

/** Entrada ponderada por costo: input + round(escritura*1.25) + round(lectura*0.1). */
export function tokensEntradaPonderados(uso: UsoTokens): number {
  return (
    entero(uso.inputTokens) +
    Math.round(entero(uso.cacheCreationTokens) * FACTOR_CACHE_ESCRITURA) +
    Math.round(entero(uso.cacheReadTokens) * FACTOR_CACHE_LECTURA)
  );
}

/** Total que descuenta del límite diario: entrada ponderada + salida. */
export function tokensPonderados(uso: UsoTokens): number {
  return tokensEntradaPonderados(uso) + entero(uso.outputTokens);
}
