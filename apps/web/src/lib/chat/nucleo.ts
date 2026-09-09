import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MensajeChat, RolMensaje, SesionChat } from "./tipos";

// Mismo patrón que lib/medicamentos/nucleo.ts: funciones puras
// (supabase, usuarioId, ...) => resultado, sin acoplarse a la ruta de API
// ni a componentes — así la persistencia del historial no puede
// desincronizarse entre la UI y /api/chat.
type Cliente = SupabaseClient;

export async function listarSesiones(
  supabase: Cliente,
  usuarioId: string
): Promise<SesionChat[]> {
  const { data: sesiones, error } = await supabase
    .from("sesiones_chat")
    .select("id, created_at, updated_at")
    .eq("usuario_id", usuarioId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las sesiones de chat: ${error.message}`);
  if (!sesiones || sesiones.length === 0) return [];

  // Último mensaje de cada sesión, para el preview del drawer (replica
  // `session.history.last.text` del ChatProvider original). Una sola
  // query ordenada desc + quedarse con la primera ocurrencia por sesión,
  // en vez de N queries.
  const { data: mensajes, error: errorMensajes } = await supabase
    .from("mensajes_chat")
    .select("sesion_id, contenido, created_at")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false });

  if (errorMensajes) throw new Error(`No se pudo leer el preview de las sesiones: ${errorMensajes.message}`);

  const ultimoPorSesion = new Map<string, string>();
  for (const m of mensajes ?? []) {
    if (!ultimoPorSesion.has(m.sesion_id as string)) {
      ultimoPorSesion.set(m.sesion_id as string, m.contenido as string);
    }
  }

  return sesiones.map((s) => ({
    ...s,
    ultimoMensaje: ultimoPorSesion.get(s.id) ?? null,
  }));
}

/**
 * Confirma que `sesionId` existe y pertenece a `usuarioId` antes de
 * escribir en ella. Necesario porque el insert de mensajes_chat solo
 * valida `usuario_id = auth.uid()` en su policy RLS — nada impide, a
 * nivel de base, insertar un mensaje propio con un sesion_id ajeno si el
 * llamador no lo verifica antes (ej. un ?sesion=<uuid-ajeno> manipulado
 * a mano en la URL). Sin este chequeo, el insert "funcionaría" pero
 * quedaría huérfano: el update de updated_at de esa sesión no matchearía
 * ninguna fila (0 rows, sin error) y el mensaje nunca aparecería en
 * ningún listado real de nadie.
 */
export async function sesionPerteneceAUsuario(
  supabase: Cliente,
  usuarioId: string,
  sesionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("sesiones_chat")
    .select("id")
    .eq("id", sesionId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo verificar la sesión: ${error.message}`);
  return data !== null;
}

export async function crearSesion(supabase: Cliente, usuarioId: string): Promise<string> {
  const { data, error } = await supabase
    .from("sesiones_chat")
    .insert({ usuario_id: usuarioId })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo crear la sesión de chat: ${error.message}`);
  return data.id as string;
}

export async function listarMensajes(
  supabase: Cliente,
  usuarioId: string,
  sesionId: string
): Promise<MensajeChat[]> {
  const { data, error } = await supabase
    .from("mensajes_chat")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("sesion_id", sesionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`);
  return data as MensajeChat[];
}

export async function guardarMensaje(
  supabase: Cliente,
  usuarioId: string,
  sesionId: string,
  role: RolMensaje,
  contenido: string
): Promise<void> {
  const { error } = await supabase
    .from("mensajes_chat")
    .insert({ usuario_id: usuarioId, sesion_id: sesionId, role, contenido });

  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);

  // Toca updated_at de la sesión para que listarSesiones la ordene por
  // actividad reciente, no por fecha de creación.
  const { error: errorUpdate } = await supabase
    .from("sesiones_chat")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sesionId)
    .eq("usuario_id", usuarioId);

  if (errorUpdate) throw new Error(`No se pudo actualizar la sesión: ${errorUpdate.message}`);
}

/**
 * Borra todas las sesiones (y por cascade sus mensajes) del usuario —
 * replica clearHistory() del ChatProvider original.
 */
export async function eliminarHistorial(supabase: Cliente, usuarioId: string): Promise<void> {
  const { error } = await supabase.from("sesiones_chat").delete().eq("usuario_id", usuarioId);
  if (error) throw new Error(`No se pudo borrar el historial: ${error.message}`);
}
