import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTEOS_FOTO_MES_GRATIS,
  cuotaMensual,
  cupoCuidadores,
  ESTUDIOS_MES_GRATIS,
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

type FuncionConCosto = "contar_pastillas" | "analizar_estudio";

/** Cuota del mes de una función con costo (para mostrar y para un chequeo previo; el cobro real es `consumirUso`). */
async function cuotaDeFuncion(supabase: Cliente, personaId: string, funcion: FuncionConCosto, limite: number): Promise<CuotaMensual> {
  try {
    if (await esPlusDePersona(supabase, personaId)) return { limitada: false };
    const { data, error } = await supabase.rpc("usos_funcion_mes", { p_persona: personaId, p_funcion: funcion });
    if (error || typeof data !== "number") {
      avisar("no se pudo contar los usos del mes", error);
      return { limitada: false };
    }
    return cuotaMensual({ plus: false, usados: data, limite });
  } catch {
    return { limitada: false };
  }
}

/** Cuota del mes de conteos de pastillas con foto para una persona. */
export function cuotaConteoPastillas(supabase: Cliente, personaId: string): Promise<CuotaMensual> {
  return cuotaDeFuncion(supabase, personaId, "contar_pastillas", CONTEOS_FOTO_MES_GRATIS);
}

/** Cuota del mes de estudios analizados (cada análisis con IA cuenta; borrar el estudio no lo devuelve). */
export function cuotaEstudios(supabase: Cliente, personaId: string): Promise<CuotaMensual> {
  return cuotaDeFuncion(supabase, personaId, "analizar_estudio", ESTUDIOS_MES_GRATIS);
}

export type UsoConsumido = { permitido: boolean; usoId: number | null };

/**
 * Chequea y registra el uso en UN paso atómico (RPC `consumir_uso_funcion`), ANTES de llamar a la IA. Con vita+ no
 * se cuenta. FALLA ABIERTO: sin la 061 o ante un error, permite y no hay nada que devolver. Si la IA falla después,
 * llamar a `devolverUso` con el `usoId`.
 */
export async function consumirUso(supabase: Cliente, personaId: string, funcion: FuncionConCosto): Promise<UsoConsumido> {
  try {
    if (await esPlusDePersona(supabase, personaId)) return { permitido: true, usoId: null };
    const tope = funcion === "contar_pastillas" ? CONTEOS_FOTO_MES_GRATIS : ESTUDIOS_MES_GRATIS;
    const { data, error } = await supabase.rpc("consumir_uso_funcion", { p_persona: personaId, p_funcion: funcion, p_tope: tope });
    const fila = Array.isArray(data) ? data[0] : data;
    if (error || !fila || typeof fila !== "object" || typeof (fila as { c_permitido?: unknown }).c_permitido !== "boolean") {
      if (error && !rpcInexistente(error)) avisar("no se pudo registrar el uso", error);
      return { permitido: true, usoId: null };
    }
    const f = fila as { c_permitido: boolean; c_id?: unknown };
    return { permitido: f.c_permitido, usoId: typeof f.c_id === "number" ? f.c_id : null };
  } catch {
    return { permitido: true, usoId: null };
  }
}

/** Devuelve un uso cuando la IA falló, para que un fallo no consuma el cupo. Nunca lanza. */
export async function devolverUso(supabase: Cliente, usoId: number | null): Promise<void> {
  if (usoId === null) return;
  try {
    const { error } = await supabase.rpc("devolver_uso_funcion", { p_id: usoId });
    if (error) console.warn("plan gratis: no se pudo devolver el uso", error.code ?? "");
  } catch {
    /* best-effort */
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
