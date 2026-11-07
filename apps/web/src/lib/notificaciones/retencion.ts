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
  web_vitals: { columna: "created_at", ms: 30 * DIA_MS },
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

// ---------------------------------------------------------------------------
// Chat: se conservan solo los últimos 7 días de mensajes (hilo continuo).
// ---------------------------------------------------------------------------
// Lo que vita RECUERDA (memorias, resumen de la conversación, consolidación) NO se borra con los mensajes:
// `memorias.mensaje_origen_id` y `resumen_conversacion.cubre_hasta_mensaje_id` no tienen FK a propósito, y el cursor del
// resumen compara por (created_at, id), así que sigue funcionando aunque el mensaje del cursor ya no exista.

/** Mensajes por tanda: acotado para que la lista de ids en la URL de PostgREST siga corta. */
export const TANDA_MENSAJES = 200;
/** Tandas máximas por corrida del cron (el atraso, si hay, se drena en las corridas siguientes). */
export const MAX_TANDAS_MENSAJES = 25;
export const RETENCION_MENSAJES_CHAT_MS = 7 * DIA_MS;

/**
 * Repite `borrarTanda` (devuelve cuántas filas borró) hasta que una tanda sale incompleta (no queda más) o se
 * llega a `maxTandas`. Devuelve el total borrado. Si una tanda lanza, el error sube al que llama.
 */
export async function borrarPorTandas(borrarTanda: () => Promise<number>, tanda: number, maxTandas: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxTandas; i++) {
    const n = await borrarTanda();
    total += n;
    if (n < tanda) break;
  }
  return total;
}

/**
 * Borra los mensajes de chat de más de 7 días (por tandas) y después las sesiones que quedaron sin mensajes. Nunca
 * lanza: ante un fallo devuelve `{error}` y el cron informa y sigue. Tabla inexistente -> ceros.
 */
export async function purgarMensajesDeChat(
  admin: SupabaseClient,
  ahoraMs: number = Date.now()
): Promise<{ mensajes: number; sesiones: number } | { error: string }> {
  const corte = limiteDeRetencion(ahoraMs, RETENCION_MENSAJES_CHAT_MS);
  try {
    const mensajes = await borrarPorTandas(
      async () => {
        const { data: ids, error } = await admin.from("mensajes_chat").select("id").lt("created_at", corte).order("created_at", { ascending: true }).limit(TANDA_MENSAJES);
        if (error) {
          if (esErrorTablaInexistente(error)) return 0;
          throw new Error(error.message);
        }
        const lista = (ids ?? []).map((f) => f.id as string);
        if (lista.length === 0) return 0;
        const { error: errorBorrar } = await admin.from("mensajes_chat").delete().in("id", lista);
        if (errorBorrar) throw new Error(errorBorrar.message);
        return lista.length;
      },
      TANDA_MENSAJES,
      MAX_TANDAS_MENSAJES
    );

    // Sesiones sin actividad en 7 días y sin mensajes: las borra la RPC de la 051 en un solo DELETE (un mensaje
    // insertado en el medio impide el borrado) y nunca toca la sesión más reciente de cada persona, que es la que
    // `obtenerSesionActiva` entrega. Sin la 051 se omite: una sesión vacía es inofensiva.
    const sesiones = await borrarPorTandas(
      async () => {
        const { data, error } = await admin.rpc("purgar_sesiones_vacias", { p_corte: corte, p_max: TANDA_MENSAJES });
        if (error) {
          if (esErrorTablaInexistente(error) || error.code === "PGRST202" || error.code === "42883") return 0;
          throw new Error(error.message);
        }
        return typeof data === "number" ? data : 0;
      },
      TANDA_MENSAJES,
      MAX_TANDAS_MENSAJES
    );
    return { mensajes, sesiones };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fallo la purga de mensajes de chat." };
  }
}
