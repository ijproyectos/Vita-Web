import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import {
  calcularConsultas,
  interpretarConsumo,
  LIMITE_INTERACCIONES_DIARIO_DEFAULT,
  type Consultas,
  type ResultadoConsumo,
} from "./interacciones-logica";

// Contador diario de interacciones con vita (migración 049). El día es el calendario de Argentina, igual que el
// límite en dólares. Uso sancionado de `service_role` (contabilidad de sistema; ver lib/supabase/admin.ts).
// Nunca lanza y FALLA ABIERTO: si el contador no responde (tabla ausente, base caída), el turno pasa.

/** Suma una interacción si hay cupo (atómico en SQL) y dice si se permite. */
export async function consumirInteraccion(usuarioId: string): Promise<ResultadoConsumo> {
  try {
    const { data, error } = await createAdminClient().rpc("consumir_interaccion", {
      p_usuario: usuarioId,
      p_fecha: fechaISOEnAR(),
      p_limite: LIMITE_INTERACCIONES_DIARIO_DEFAULT,
    });
    if (error) console.error("interacciones: no se pudo contar (se deja pasar)");
    return interpretarConsumo(data, !!error);
  } catch {
    console.error("interacciones: no se pudo contar (se deja pasar)");
    return { permitido: true, consultas: null };
  }
}

/** Consultas de hoy para mostrar (sin consumir). null = ocultar el indicador. */
export async function obtenerConsultasHoy(usuarioId: string): Promise<Consultas | null> {
  try {
    const { data, error } = await createAdminClient().rpc("interacciones_hoy", {
      p_usuario: usuarioId,
      p_fecha: fechaISOEnAR(),
      p_limite: LIMITE_INTERACCIONES_DIARIO_DEFAULT,
    });
    if (error) return null;
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila || typeof fila !== "object") return null;
    const f = fila as Record<string, unknown>;
    const usadas = Number(f.h_usadas);
    const limite = Number(f.h_limite);
    if (!Number.isFinite(usadas) || !Number.isFinite(limite)) return null;
    return calcularConsultas(usadas, limite);
  } catch {
    return null;
  }
}
