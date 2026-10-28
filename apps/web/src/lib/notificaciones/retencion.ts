import type { SupabaseClient } from "@supabase/supabase-js";

// Retención de tablas de sistema que corre dentro del cron existente `dosis-vencidas`
// (sin jobs nuevos). Se llama con el cliente admin sancionado del cron.

export const HORA_MS = 60 * 60 * 1000;
export const DIA_MS = 24 * HORA_MS;

/** Retenciones por tabla (constantes en código). */
export const RETENCIONES = {
  acciones_agente: { columna: "created_at", ms: 48 * HORA_MS },
  registros_chat: { columna: "created_at", ms: 90 * DIA_MS },
  limites_pedidos: { columna: "ventana_inicio", ms: 2 * DIA_MS },
} as const;

/** Instante (ISO) anterior al cual las filas se borran. */
export function limiteDeRetencion(ahoraMs: number, retencionMs: number): string {
  return new Date(ahoraMs - retencionMs).toISOString();
}

/** true si el error de PostgREST/Postgres es "la tabla no existe" (migración sin aplicar). */
export function esErrorTablaInexistente(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/**
 * Borra las filas de `tabla` más viejas que `retencionMs` y devuelve cuántas. Nunca lanza:
 * tabla inexistente -> 0; cualquier otro fallo -> `{error}` (el cron lo informa y sigue).
 */
export async function purgarAnteriores(
  admin: SupabaseClient,
  tabla: keyof typeof RETENCIONES,
  ahoraMs: number = Date.now()
): Promise<number | { error: string }> {
  const { columna, ms } = RETENCIONES[tabla];
  try {
    const { data, error } = await admin.from(tabla).delete().lt(columna, limiteDeRetencion(ahoraMs, ms)).select(columna);
    if (error) return esErrorTablaInexistente(error) ? 0 : { error: error.message };
    return data?.length ?? 0;
  } catch (e) {
    return { error: e instanceof Error ? e.message : `Fallo la purga de ${tabla}.` };
  }
}
