import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./acceso";
import { type FilaRegistroChat, type FilaValoracion } from "./chat-metricas";

/** Tope de filas que se leen por consulta: el panel nunca carga el período entero sin límite. */
export const TOPE_FILAS_CHAT = 5000;

export type DatosChat = {
  filas: FilaRegistroChat[];
  /** Total real de respuestas del período (puede superar `filas`). */
  total: number;
  truncado: boolean;
  /** null = la tabla de valoraciones no existe (060 sin aplicar) o no se pudo leer. */
  valoraciones: FilaValoracion[] | null;
  valoracionesTruncadas: boolean;
  negativas: FilaValoracion[];
};

const COLUMNAS =
  "created_at, version_prompt, modelo, latencia_ms, latencia_primer_token_ms, tools, tokens_entrada, tokens_salida, tokens_cache_lectura, tokens_cache_escritura, resultado, error_codigo";

function numero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function aFila(r: Record<string, unknown>): FilaRegistroChat {
  return {
    created_at: String(r.created_at ?? ""),
    version_prompt: String(r.version_prompt ?? ""),
    modelo: String(r.modelo ?? ""),
    latencia_ms: numero(r.latencia_ms),
    latencia_primer_token_ms: typeof r.latencia_primer_token_ms === "number" ? r.latencia_primer_token_ms : null,
    tools: Array.isArray(r.tools) ? r.tools.filter((t): t is string => typeof t === "string") : [],
    tokens_entrada: numero(r.tokens_entrada),
    tokens_salida: numero(r.tokens_salida),
    tokens_cache_lectura: numero(r.tokens_cache_lectura),
    tokens_cache_escritura: numero(r.tokens_cache_escritura),
    resultado: String(r.resultado ?? ""),
    error_codigo: typeof r.error_codigo === "string" ? r.error_codigo : null,
  };
}

function aValoracion(r: Record<string, unknown>): FilaValoracion {
  return {
    valor: numero(r.valor),
    motivo: typeof r.motivo === "string" ? r.motivo : null,
    created_at: String(r.created_at ?? ""),
    usuario_id: String(r.usuario_id ?? ""),
  };
}

/**
 * Métricas del chat del período (sin texto de mensajes). Vuelve a exigir admin ANTES de crear el cliente `service_role`.
 * Nunca lanza: null = no se pudieron leer los registros. Las valoraciones degradan solas si falta la migración 060.
 */
export async function obtenerDatosChat(horas: number): Promise<DatosChat | null> {
  await requireAdmin();
  const horasOk = Math.min(Math.max(Math.floor(horas) || 24, 1), 24 * 90);
  const desde = new Date(Date.now() - horasOk * 3_600_000).toISOString();
  try {
    const admin = createAdminClient();
    const [registros, conteo] = await Promise.all([
      admin.from("registros_chat").select(COLUMNAS).gte("created_at", desde).order("created_at", { ascending: false }).limit(TOPE_FILAS_CHAT),
      admin.from("registros_chat").select("id", { count: "exact", head: true }).gte("created_at", desde),
    ]);
    if (registros.error) {
      console.error("admin chat: no se pudieron leer los registros");
      return null;
    }
    const filas = (registros.data ?? []).map((r) => aFila(r as Record<string, unknown>));
    const total = typeof conteo.count === "number" && !conteo.error ? Math.max(conteo.count, filas.length) : filas.length;

    let valoraciones: FilaValoracion[] | null = null;
    let negativas: FilaValoracion[] = [];
    try {
      const [vs, neg] = await Promise.all([
        admin.from("chat_valoraciones").select("valor, motivo, created_at, usuario_id").gte("created_at", desde).order("created_at", { ascending: false }).limit(TOPE_FILAS_CHAT),
        admin.from("chat_valoraciones").select("valor, motivo, created_at, usuario_id").eq("valor", -1).gte("created_at", desde).order("created_at", { ascending: false }).limit(15),
      ]);
      if (!vs.error && !neg.error) {
        valoraciones = (vs.data ?? []).map((r) => aValoracion(r as Record<string, unknown>));
        negativas = (neg.data ?? []).map((r) => aValoracion(r as Record<string, unknown>));
      }
    } catch {
      valoraciones = null;
    }

    return {
      filas,
      total,
      truncado: total > filas.length,
      valoraciones,
      valoracionesTruncadas: valoraciones !== null && valoraciones.length >= TOPE_FILAS_CHAT,
      negativas,
    };
  } catch {
    console.error("admin chat: no se pudieron leer los registros");
    return null;
  }
}
