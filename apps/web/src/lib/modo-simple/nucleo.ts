import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { esMinutosPosponer, PREFS_POR_DEFECTO, type ParcheModoSimple, type PrefsModoSimple } from "./tipos";

// Preferencias del modo simple de UNA persona (migración 029). Funciones
// `(cliente, personaId, ...)`: la RLS decide quién lee y quién escribe (la
// persona, o un cuidador Admin para escribir).
type Cliente = SupabaseClient;

const COLUMNAS =
  "ver_turnos, ver_mediciones, charlar, ayuda, voz, voz_lenta, posponer, posponer_min, llamar_nombre, llamar_telefono";

function desdeFila(f: Record<string, unknown>): PrefsModoSimple {
  const bool = (k: keyof PrefsModoSimple) => (typeof f[k] === "boolean" ? (f[k] as boolean) : (PREFS_POR_DEFECTO[k] as boolean));
  const nombre = typeof f.llamar_nombre === "string" && f.llamar_nombre ? f.llamar_nombre : null;
  const tel = typeof f.llamar_telefono === "string" && f.llamar_telefono ? f.llamar_telefono : null;
  return {
    ver_turnos: bool("ver_turnos"),
    ver_mediciones: bool("ver_mediciones"),
    charlar: bool("charlar"),
    ayuda: bool("ayuda"),
    voz: bool("voz"),
    voz_lenta: bool("voz_lenta"),
    posponer: bool("posponer"),
    posponer_min: esMinutosPosponer(f.posponer_min) ? f.posponer_min : PREFS_POR_DEFECTO.posponer_min,
    llamar_nombre: nombre && tel ? nombre : null,
    llamar_telefono: nombre && tel ? tel : null,
  };
}

/**
 * Preferencias vigentes + si la tabla existe (`disponible`). Sin fila: defaults;
 * con la 029 sin aplicar: defaults y `disponible = false`. Nunca lanza.
 */
export async function obtenerPrefsConEstado(
  supabase: Cliente,
  personaId: string
): Promise<{ prefs: PrefsModoSimple; disponible: boolean }> {
  try {
    const { data, error } = await supabase.from("preferencias_modo_simple").select(COLUMNAS).eq("usuario_id", personaId).maybeSingle();
    if (error) return { prefs: { ...PREFS_POR_DEFECTO }, disponible: false };
    return { prefs: data ? desdeFila(data as Record<string, unknown>) : { ...PREFS_POR_DEFECTO }, disponible: true };
  } catch {
    return { prefs: { ...PREFS_POR_DEFECTO }, disponible: false };
  }
}

export async function obtenerPrefs(supabase: Cliente, personaId: string): Promise<PrefsModoSimple> {
  return (await obtenerPrefsConEstado(supabase, personaId)).prefs;
}

/**
 * Cambia SOLO los campos del parche (cada interruptor guarda al instante): el
 * upsert no toca el resto de una fila existente y, sin fila, el resto toma los
 * defaults de la tabla. Ya validado por quien llama.
 */
export async function actualizarPrefs(
  supabase: Cliente,
  personaId: string,
  parche: ParcheModoSimple
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("preferencias_modo_simple")
    .upsert({ usuario_id: personaId, ...parche, updated_at: new Date().toISOString() }, { onConflict: "usuario_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
