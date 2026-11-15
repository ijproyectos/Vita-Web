import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { esVitaPlus } from "@/lib/vita-plus/nucleo";
import { LIMITE_CHAT_GRATIS, rpcInexistente } from "@/lib/plan-gratis/logica";
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

/**
 * Tope extra del plan gratis (migración 061): 5 respuestas por día para quien NO tiene vita+ (la propia cuenta que
 * chatea; el efectivo es min(5, límite configurado)). null = vita+ (rige el límite configurado). Lee `esVitaPlus`,
 * el único punto de lectura de vita+.
 */
async function topeDelPlan(admin: ReturnType<typeof createAdminClient>, usuarioId: string): Promise<number | null> {
  try {
    return (await esVitaPlus(admin, usuarioId)) ? null : LIMITE_CHAT_GRATIS;
  } catch {
    return null;
  }
}

/** Suma una interacción si hay cupo (atómico en SQL) y dice si se permite. */
export async function consumirInteraccion(usuarioId: string): Promise<ResultadoConsumo> {
  try {
    const admin = createAdminClient();
    const tope = await topeDelPlan(admin, usuarioId);
    const base = { p_usuario: usuarioId, p_fecha: fechaISOEnAR(), p_limite: LIMITE_INTERACCIONES_DIARIO_DEFAULT };
    let { data, error } = await admin.rpc("consumir_interaccion", tope === null ? base : { ...base, p_tope: tope });
    let gratis = tope !== null;
    if (error && tope !== null && rpcInexistente(error)) {
      // Sin la migración 061 la función no conoce `p_tope`: se mantiene el comportamiento anterior (sin tope gratis).
      console.warn("plan gratis: falta la migración 061, el chat sigue con el límite general");
      ({ data, error } = await admin.rpc("consumir_interaccion", base));
      gratis = false;
    }
    if (error) console.error("interacciones: no se pudo contar (se deja pasar)");
    return interpretarConsumo(data, !!error, gratis);
  } catch {
    console.error("interacciones: no se pudo contar (se deja pasar)");
    return { permitido: true, consultas: null };
  }
}

/** Consultas de hoy para mostrar (sin consumir). null = ocultar el indicador. */
export async function obtenerConsultasHoy(usuarioId: string): Promise<Consultas | null> {
  try {
    const admin = createAdminClient();
    const tope = await topeDelPlan(admin, usuarioId);
    const base = { p_usuario: usuarioId, p_fecha: fechaISOEnAR(), p_limite: LIMITE_INTERACCIONES_DIARIO_DEFAULT };
    let { data, error } = await admin.rpc("interacciones_hoy", tope === null ? base : { ...base, p_tope: tope });
    let gratis = tope !== null;
    if (error && tope !== null && rpcInexistente(error)) {
      ({ data, error } = await admin.rpc("interacciones_hoy", base));
      gratis = false;
    }
    if (error) return null;
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila || typeof fila !== "object") return null;
    const f = fila as Record<string, unknown>;
    const usadas = Number(f.h_usadas);
    const limite = Number(f.h_limite);
    if (!Number.isFinite(usadas) || !Number.isFinite(limite)) return null;
    return calcularConsultas(usadas, limite, gratis);
  } catch {
    return null;
  }
}
