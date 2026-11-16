import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { esErrorTablaInexistente } from "@/lib/notificaciones/retencion";
import { observacionesVisibles, ordenarObservaciones } from "./orden";
import type { Observacion } from "./tipos";

// Lecturas y escrituras de observaciones desde la app: SIEMPRE con el cliente de sesión (RLS). El dueño y un
// cuidador (cualquier rol) leen; marcar vista o descartar lo permite la RLS al dueño y a un cuidador con rol
// 'editar'. Nada de esto usa el cliente admin: ese solo existe en el cron (`generar.ts`).
type Cliente = SupabaseClient;

const COLUMNAS =
  "id, usuario_id, tipo, severidad, clave, titulo, texto, datos, href, creada_at, vigente_hasta, vista_at, descartada_at";

/**
 * Observaciones vigentes y no descartadas de una persona, de atención primero y más nuevas primero. Nunca lanza:
 * sin la migración 062 (o ante cualquier error) devuelve [] y la tarjeta no se muestra.
 */
export async function listarObservaciones(supabase: Cliente, personaId: string, limite = 50): Promise<Observacion[]> {
  try {
    const ahora = new Date();
    const { data, error } = await supabase
      .from("observaciones")
      .select(COLUMNAS)
      .eq("usuario_id", personaId)
      .is("descartada_at", null)
      .gt("vigente_hasta", ahora.toISOString())
      .order("creada_at", { ascending: false })
      .limit(limite);
    if (error || !data) return [];
    return ordenarObservaciones(observacionesVisibles(data as unknown as Observacion[], ahora.getTime()));
  } catch {
    return [];
  }
}

/** Marca como vistas las que todavía no lo estaban. Best-effort: devuelve false si no se pudo (p. ej. rol Lector). */
export async function marcarVistas(supabase: Cliente, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    const { error } = await supabase.from("observaciones").update({ vista_at: new Date().toISOString() }).in("id", ids).is("vista_at", null);
    return !error;
  } catch {
    return false;
  }
}

/** "No me lo muestres más". true solo si la fila se cambió (la RLS no deja a un Lector). */
export async function descartarObservacion(supabase: Cliente, id: string): Promise<{ ok: true } | { ok: false; sinTabla: boolean }> {
  try {
    const { data, error } = await supabase
      .from("observaciones")
      .update({ descartada_at: new Date().toISOString() })
      .eq("id", id)
      .is("descartada_at", null)
      .select("id");
    if (error) return { ok: false, sinTabla: esErrorTablaInexistente(error) };
    return data && data.length > 0 ? { ok: true } : { ok: false, sinTabla: false };
  } catch {
    return { ok: false, sinTabla: false };
  }
}

/** Borra las observaciones de una persona (Borrar historial: son derivadas de las mediciones y estudios que se borran). */
export async function borrarObservacionesDe(supabase: Cliente, usuarioId: string): Promise<number> {
  try {
    const { data, error } = await supabase.from("observaciones").delete().eq("usuario_id", usuarioId).select("id");
    return error ? 0 : (data?.length ?? 0);
  } catch {
    return 0;
  }
}
