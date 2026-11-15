import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTEOS_FOTO_MES_GRATIS,
  cuotaMensual,
  cupoCuidadores,
  ESTUDIOS_MES_GRATIS,
  inicioMesAR,
  rpcInexistente,
  type CuotaMensual,
  type CupoCuidadores,
} from "./logica";

// Límites del plan gratis (migración 061). Todo con el cliente de SESIÓN (RLS / RPC con chequeo de quién pregunta);
// nunca el cliente admin. FALLA ABIERTO: si la migración no está aplicada o la base no responde, no se bloquea a
// nadie (se deja un warning sin datos del usuario). El chat tiene su propio camino en lib/uso-ia/interacciones.ts.

type Cliente = SupabaseClient;

function avisar(que: string, error: { code?: string } | null): void {
  console.warn(`plan gratis: ${que} (se deja pasar)`, error?.code ?? "");
}

/**
 * ¿La persona tiene vita+, ella o un Admin que la cuida? Usa la RPC `es_vita_plus_de`. Si no se puede saber, se
 * trata como vita+ (falla abierto): `false` solo cuando la base confirma que es gratis.
 */
export async function esPlusDePersona(supabase: Cliente, personaId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("es_vita_plus_de", { p_persona: personaId });
    if (error || typeof data !== "boolean") {
      avisar("no se pudo leer el plan", error);
      return true;
    }
    return data;
  } catch {
    avisar("no se pudo leer el plan", null);
    return true;
  }
}

/** Cuota del mes de conteos de pastillas con foto para una persona. */
export async function cuotaConteoPastillas(supabase: Cliente, personaId: string): Promise<CuotaMensual> {
  try {
    if (await esPlusDePersona(supabase, personaId)) return { limitada: false };
    const { data, error } = await supabase.rpc("usos_funcion_mes", { p_persona: personaId, p_funcion: "contar_pastillas" });
    if (error || typeof data !== "number") {
      avisar("no se pudo contar los usos del mes", error);
      return { limitada: false };
    }
    return cuotaMensual({ plus: false, usados: data, limite: CONTEOS_FOTO_MES_GRATIS });
  } catch {
    return { limitada: false };
  }
}

/** Anota un conteo con foto EXITOSO. Nunca lanza ni bloquea: una falla de contabilidad no le quita el conteo a la persona. */
export async function registrarConteoPastillas(supabase: Cliente, personaId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("registrar_uso_funcion", { p_persona: personaId, p_funcion: "contar_pastillas" });
    if (error && !rpcInexistente(error)) console.warn("plan gratis: no se pudo anotar el conteo", error.code ?? "");
  } catch {
    /* best-effort */
  }
}

/** Cuota del mes de estudios: se cuentan los estudios creados este mes (AR) de la persona. */
export async function cuotaEstudios(supabase: Cliente, personaId: string, ahora: Date = new Date()): Promise<CuotaMensual> {
  try {
    if (await esPlusDePersona(supabase, personaId)) return { limitada: false };
    const { count, error } = await supabase
      .from("estudios")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", personaId)
      .gte("created_at", inicioMesAR(ahora).toISOString());
    if (error || typeof count !== "number") {
      avisar("no se pudieron contar los estudios del mes", error);
      return { limitada: false };
    }
    return cuotaMensual({ plus: false, usados: count, limite: ESTUDIOS_MES_GRATIS });
  } catch {
    return { limitada: false };
  }
}

/** Cupo de cuidadores de una persona (aceptados + pendientes vigentes). Sin la 061 o sin permiso: sin tope. */
export async function cupoCuidadoresDe(supabase: Cliente, personaId: string): Promise<CupoCuidadores> {
  try {
    const { data, error } = await supabase.rpc("cupo_cuidadores", { p_persona: personaId });
    const fila = Array.isArray(data) ? data[0] : data;
    if (error || !fila || typeof fila !== "object") {
      if (error) avisar("no se pudo leer el cupo de cuidadores", error);
      return { limitado: false };
    }
    const f = fila as { c_plus?: unknown; c_usados?: unknown };
    if (typeof f.c_plus !== "boolean" || typeof f.c_usados !== "number") return { limitado: false };
    return cupoCuidadores({ plus: f.c_plus, usados: f.c_usados });
  } catch {
    return { limitado: false };
  }
}
