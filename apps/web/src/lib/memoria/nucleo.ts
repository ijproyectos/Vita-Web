import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoriaContexto } from "./contexto";
import type { ResumenConversacion } from "./tipos";

// Acceso a datos de la memoria. Todo con el cliente de SESIÓN (RLS owner-only de 035): nunca service_role.
// Cada función degrada si la migración 035 no está aplicada: nada de esto puede tumbar el chat.
type Cliente = SupabaseClient;

// ---------------------------------------------------------------------------
// Estado de la memoria de la persona
// ---------------------------------------------------------------------------
export type EstadoMemoria = { activa: boolean; avisoVisto: boolean };

/**
 * `perfiles.memoria_activa`. Sin la migración 035 (columna inexistente) o ante cualquier error la memoria
 * se considera APAGADA: el chat se comporta como antes (sin herramientas ni capas 2–3).
 */
export async function estadoMemoria(supabase: Cliente, usuarioId: string): Promise<EstadoMemoria> {
  try {
    const { data, error } = await supabase
      .from("perfiles")
      .select("memoria_activa, memoria_aviso_visto_at")
      .eq("id", usuarioId)
      .maybeSingle();
    if (error || !data) return { activa: false, avisoVisto: true };
    return { activa: data.memoria_activa === true, avisoVisto: data.memoria_aviso_visto_at != null };
  } catch {
    return { activa: false, avisoVisto: true };
  }
}

// ---------------------------------------------------------------------------
// Lectura para las capas 2 y 3
// ---------------------------------------------------------------------------
/** Recuerdos vigentes candidatos al contexto (la selección y el tope en tokens los hace construirBloqueMemorias). */
export async function cargarMemoriasParaContexto(supabase: Cliente, usuarioId: string): Promise<MemoriaContexto[]> {
  try {
    const { data, error } = await supabase
      .from("memorias")
      .select("id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, destacado, usos, vence_at, estado, updated_at")
      .eq("usuario_id", usuarioId)
      .eq("estado", "vigente")
      .order("destacado", { ascending: false })
      .order("usos", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(120);
    if (error) return [];
    return (data ?? []) as MemoriaContexto[];
  } catch {
    return [];
  }
}

/** Resumen confirmado de la conversación (lo produce M5). null si no hay o la tabla no existe. */
export async function cargarResumen(supabase: Cliente, usuarioId: string): Promise<ResumenConversacion | null> {
  try {
    const { data, error } = await supabase.from("resumen_conversacion").select("*").eq("usuario_id", usuarioId).maybeSingle();
    if (error || !data) return null;
    return data as ResumenConversacion;
  } catch {
    return null;
  }
}
