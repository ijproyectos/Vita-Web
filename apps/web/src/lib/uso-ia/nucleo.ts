import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { calcularUso, type UsoDiarioConEstado } from "./tipos";
import { costoMicroUSD } from "./precios";
import { LIMITE_MICRO_USD_DIARIO, LIMITE_USD_DIARIO, microDesdeTokensLegacy, microUsdDeFila, superaLimite } from "./limite";

// Límite diario de uso de IA por usuario, en DÓLARES (US$10 por mes = US$0,33
// por día; ver ./limite.ts). Cubre todos los puntos de contacto con Anthropic
// (chat con vita, extracción de estudios, onboarding conversacional, conteo de
// pastillas): todos suman a la MISMA cuenta diaria. El costo se calcula con los
// tokens REALES que informa la API (input, output, lectura y escritura de
// cache) y los precios de ./precios.ts, y se acumula en micro-USD enteros.
//
// Si la migración 036 no está aplicada (no existe `costo_micro_usd`), se
// degrada a las columnas viejas de tokens con una estimación equivalente
// (200.000 tokens ~ US$0,33): nunca bloquea ni rompe la app.
export { LIMITE_USD_DIARIO };

const SELECT_COSTO = "costo_micro_usd, tokens_input, tokens_output";
const SELECT_LEGACY = "tokens_input, tokens_output";

// El "día" del contador es el calendario de Argentina, no UTC: con UTC el
// contador se reseteaba a las 21:00 AR y "se renueva a la medianoche" (lo
// que le decimos a la persona) sería mentira. `fecha` es una columna date,
// solo cambia qué fecha se escribe y se lee.
function fechaHoy(): string {
  return fechaISOEnAR();
}

/** Lee el gasto del día en micro-USD; null si no se pudo leer. */
async function leerGastoHoy(usuarioId: string): Promise<number | null> {
  const admin = createAdminClient();
  const fecha = fechaHoy();
  const conCosto = await admin.from("uso_ia_diario").select(SELECT_COSTO).eq("usuario_id", usuarioId).eq("fecha", fecha).maybeSingle();
  if (!conCosto.error) return microUsdDeFila(conCosto.data, true);
  // Probablemente 036 sin aplicar: se reintenta con las columnas viejas.
  const legacy = await admin.from("uso_ia_diario").select(SELECT_LEGACY).eq("usuario_id", usuarioId).eq("fecha", fecha).maybeSingle();
  if (legacy.error) return null;
  return microUsdDeFila(legacy.data, false);
}

/**
 * Uso del día para mostrar en la UI (en micro-USD: `usados`/`limite`/`restantes`;
 * la UI solo muestra porcentajes). Nunca lanza: si no se puede leer devuelve
 * null y la UI simplemente oculta el indicador.
 */
export async function obtenerUsoHoy(usuarioId: string): Promise<UsoDiarioConEstado | null> {
  try {
    const gasto = await leerGastoHoy(usuarioId);
    if (gasto === null) return null;
    return calcularUso(gasto, LIMITE_MICRO_USD_DIARIO);
  } catch {
    return null;
  }
}

export type ResultadoVerificacionLimite = { ok: true } | { ok: false; mensaje: string };

/**
 * Chequea, ANTES de llamar a Anthropic, si el usuario ya superó su límite
 * diario. No puede evitar que UNA llamada puntual se pase del límite (el
 * costo real no se sabe hasta que termina) — evita que SIGA llamando una vez
 * que ya lo superó. Nunca lanza ni bloquea por un fallo de lectura: si la
 * contabilidad no se puede leer, deja pasar la llamada.
 */
export async function verificarLimiteDiario(usuarioId: string): Promise<ResultadoVerificacionLimite> {
  try {
    const gasto = await leerGastoHoy(usuarioId);
    if (gasto === null) return { ok: true };
    if (superaLimite(gasto)) {
      return {
        ok: false,
        mensaje: "Llegaste al límite diario de uso de vita con IA. Probá de nuevo mañana, o cargá los datos a mano mientras tanto.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export type UsoLlamadaIA = {
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  /** `cache_read_input_tokens` de la respuesta. */
  cacheReadTokens?: number;
  /** `cache_creation_input_tokens` de la respuesta. */
  cacheWriteTokens?: number;
};

/**
 * Suma el uso REAL de una llamada a Anthropic (tokens que informa la propia
 * respuesta, nunca una estimación) y su costo en micro-USD a la fila del día.
 * Lectura-antes-de-escribir, no una suma atómica en SQL — aceptable para la
 * escala real del proyecto. Nunca lanza — perder una fila de contabilidad no
 * debe romper la respuesta que la persona ya recibió.
 */
export async function registrarUsoIA(usuarioId: string, uso: UsoLlamadaIA): Promise<UsoDiarioConEstado | null> {
  try {
    const admin = createAdminClient();
    const fecha = fechaHoy();
    const cacheRead = Math.max(0, uso.cacheReadTokens ?? 0);
    const cacheWrite = Math.max(0, uso.cacheWriteTokens ?? 0);
    const costo = costoMicroUSD(uso.modelo, {
      input: uso.inputTokens,
      output: uso.outputTokens,
      cacheRead,
      cacheWrite,
    });
    const ahora = new Date().toISOString();

    const completa = await admin
      .from("uso_ia_diario")
      .select("costo_micro_usd, tokens_input, tokens_output, tokens_cache_lectura, tokens_cache_escritura, llamadas")
      .eq("usuario_id", usuarioId)
      .eq("fecha", fecha)
      .maybeSingle();

    if (!completa.error) {
      const e = completa.data;
      const costoTotal = (Number(e?.costo_micro_usd ?? 0) || 0) + costo;
      const { error } = await admin.from("uso_ia_diario").upsert({
        usuario_id: usuarioId,
        fecha,
        tokens_input: (Number(e?.tokens_input ?? 0) || 0) + uso.inputTokens,
        tokens_output: (Number(e?.tokens_output ?? 0) || 0) + uso.outputTokens,
        tokens_cache_lectura: (Number(e?.tokens_cache_lectura ?? 0) || 0) + cacheRead,
        tokens_cache_escritura: (Number(e?.tokens_cache_escritura ?? 0) || 0) + cacheWrite,
        costo_micro_usd: costoTotal,
        llamadas: (e?.llamadas ?? 0) + 1,
        updated_at: ahora,
      });
      if (error) return null;
      return calcularUso(costoTotal, LIMITE_MICRO_USD_DIARIO);
    }

    // 036 sin aplicar: solo columnas viejas. Los tokens de cache se pliegan al
    // contador viejo (escritura completa, lectura al 10%) para que la
    // estimación en dólares siga siendo razonable.
    const legacy = await admin
      .from("uso_ia_diario")
      .select("tokens_input, tokens_output, llamadas")
      .eq("usuario_id", usuarioId)
      .eq("fecha", fecha)
      .maybeSingle();
    if (legacy.error) return null;
    const e = legacy.data;
    const tokensInput = (Number(e?.tokens_input ?? 0) || 0) + uso.inputTokens + cacheWrite + Math.round(cacheRead / 10);
    const tokensOutput = (Number(e?.tokens_output ?? 0) || 0) + uso.outputTokens;
    const { error } = await admin.from("uso_ia_diario").upsert({
      usuario_id: usuarioId,
      fecha,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      llamadas: (e?.llamadas ?? 0) + 1,
      updated_at: ahora,
    });
    if (error) return null;
    return calcularUso(microDesdeTokensLegacy(tokensInput + tokensOutput), LIMITE_MICRO_USD_DIARIO);
  } catch {
    // Silencioso a propósito — ver comentario de la función.
    return null;
  }
}
