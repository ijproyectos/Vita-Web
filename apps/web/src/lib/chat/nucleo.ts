import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarPagina, elegirSesionActiva, inicioVentanaChat, TAMANO_PAGINA_CHAT } from "./hilo";
import type { MensajeChat, RolMensaje } from "./tipos";

// Mismo patrón que lib/medicamentos/nucleo.ts: funciones puras
// (supabase, usuarioId, ...) => resultado, sin acoplarse a la ruta de API
// ni a componentes — así la persistencia del historial no puede
// desincronizarse entre la UI y /api/chat.
type Cliente = SupabaseClient;

/**
 * Sesión donde se escribe: una conversación continua por persona. Se reutiliza la de actividad más reciente (las
 * viejas de antes del hilo único siguen existiendo y se leen juntas por `usuario_id`) y solo se crea una si no hay.
 */
export async function obtenerSesionActiva(supabase: Cliente, usuarioId: string): Promise<string> {
  const { data, error } = await supabase
    .from("sesiones_chat")
    .select("id, updated_at")
    .eq("usuario_id", usuarioId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`No se pudo leer la sesión de chat: ${error.message}`);
  const activa = elegirSesionActiva((data ?? []) as { id: string; updated_at: string }[]);
  if (activa) return activa.id;

  const { data: creada, error: errorCrear } = await supabase
    .from("sesiones_chat")
    .insert({ usuario_id: usuarioId })
    .select("id")
    .single();
  if (errorCrear) throw new Error(`No se pudo crear la sesión de chat: ${errorCrear.message}`);
  return creada.id as string;
}

/**
 * Una página del hilo: mensajes de los últimos 7 días de TODAS las sesiones de la persona, cronológicos.
 * `antesDe` (created_at del más viejo ya cargado) sube a páginas anteriores; `hayMas` dice si queda algo más viejo.
 */
export async function listarHilo(
  supabase: Cliente,
  usuarioId: string,
  opciones: { antesDe?: string; limite?: number; ahoraMs?: number } = {}
): Promise<{ mensajes: MensajeChat[]; hayMas: boolean }> {
  const limite = Math.max(1, Math.min(opciones.limite ?? TAMANO_PAGINA_CHAT, 100));
  let q = supabase
    .from("mensajes_chat")
    .select("id, sesion_id, role, contenido, created_at")
    .eq("usuario_id", usuarioId)
    .gte("created_at", inicioVentanaChat(opciones.ahoraMs ?? Date.now()));
  if (opciones.antesDe) q = q.lt("created_at", opciones.antesDe);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite + 1);
  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`);
  return armarPagina((data ?? []) as MensajeChat[], limite);
}

/** Cola del hilo que se le manda al modelo: los últimos `limite` mensajes (7 días) de la persona, cronológicos. */
export async function listarCola(supabase: Cliente, usuarioId: string, limite: number): Promise<MensajeChat[]> {
  const { mensajes } = await listarHilo(supabase, usuarioId, { limite });
  return mensajes;
}

export async function guardarMensaje(
  supabase: Cliente,
  usuarioId: string,
  sesionId: string,
  role: RolMensaje,
  contenido: string
): Promise<string | null> {
  const { data: fila, error } = await supabase
    .from("mensajes_chat")
    .insert({ usuario_id: usuarioId, sesion_id: sesionId, role, contenido })
    .select("id")
    .single();

  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);

  // Toca updated_at de la sesión para que listarSesiones la ordene por
  // actividad reciente, no por fecha de creación.
  const { error: errorUpdate } = await supabase
    .from("sesiones_chat")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sesionId)
    .eq("usuario_id", usuarioId);

  if (errorUpdate) throw new Error(`No se pudo actualizar la sesión: ${errorUpdate.message}`);

  // Id del mensaje guardado: los recuerdos que vita saque de él lo apuntan como origen.
  return typeof fila?.id === "string" ? fila.id : null;
}
