import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Límite diario de tokens de Anthropic por usuario — pedido explícito del
// usuario tras quedarse sin crédito, para que una sola cuenta no pueda
// agotar el presupuesto de todo el proyecto en un día. Cubre los tres
// puntos de contacto reales con Anthropic (todos suman a la MISMA cuenta
// diaria, no hay un límite separado por función): el chat con vita
// (api/chat/route.ts — el que más consume, por el loop de tool-calling
// de varios turnos), la extracción de estudios (lib/estudios/extraer.ts)
// y la extracción del onboarding conversacional (lib/onboarding/extraer.ts).
//
// Ajustable acá mismo, no en una env var — no hace falta el nivel de
// ceremonia de un secret para esto, y así queda versionado junto al
// código que lo aplica.
export const LIMITE_TOKENS_DIARIO = 200_000;

function fechaHoyUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ResultadoVerificacionLimite = { ok: true } | { ok: false; mensaje: string };

/**
 * Chequea, ANTES de llamar a Anthropic, si el usuario ya superó su límite
 * diario. No puede evitar que UNA llamada puntual se pase del límite (el
 * tamaño real de una respuesta no se sabe hasta que termina) — evita que
 * SIGA llamando una vez que ya lo superó. Nunca lanza ni bloquea por un
 * fallo de lectura: si la contabilidad no se puede leer, deja pasar la
 * llamada (un error de accounting no debe romper la funcionalidad real
 * de la app — mismo criterio que el resto de los `nunca lanza` del
 * proyecto).
 */
export async function verificarLimiteDiario(usuarioId: string): Promise<ResultadoVerificacionLimite> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("uso_ia_diario")
      .select("tokens_input, tokens_output")
      .eq("usuario_id", usuarioId)
      .eq("fecha", fechaHoyUTC())
      .maybeSingle();

    if (error) return { ok: true };

    const total = (data?.tokens_input ?? 0) + (data?.tokens_output ?? 0);
    if (total >= LIMITE_TOKENS_DIARIO) {
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

/**
 * Suma el uso REAL de una llamada a Anthropic (los tokens que la propia
 * respuesta de la API informa, nunca una estimación) a la fila del día
 * para este usuario. Lectura-antes-de-escribir, no una suma atómica en
 * SQL — aceptable para la escala real de este proyecto (un puñado de
 * usuarios, sin llamadas concurrentes de la misma persona en el mismo
 * instante); si el proyecto creciera de verdad, esto pasaría a un RPC con
 * `tokens_input = uso_ia_diario.tokens_input + excluded.tokens_input`
 * para que sea atómico de verdad. Nunca lanza — perder una fila de
 * contabilidad no debe romper la respuesta que la persona ya recibió.
 */
export async function registrarUsoIA(usuarioId: string, uso: { inputTokens: number; outputTokens: number }): Promise<void> {
  try {
    const admin = createAdminClient();
    const fecha = fechaHoyUTC();

    const { data: existente } = await admin
      .from("uso_ia_diario")
      .select("tokens_input, tokens_output, llamadas")
      .eq("usuario_id", usuarioId)
      .eq("fecha", fecha)
      .maybeSingle();

    await admin.from("uso_ia_diario").upsert({
      usuario_id: usuarioId,
      fecha,
      tokens_input: (existente?.tokens_input ?? 0) + uso.inputTokens,
      tokens_output: (existente?.tokens_output ?? 0) + uso.outputTokens,
      llamadas: (existente?.llamadas ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Silencioso a propósito — ver comentario de la función.
  }
}
