import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BloquesTurno } from "@/lib/memoria/tipos";
import { filtroAnteriorA, type CursorHilo } from "./cursor";
import type { MensajeChat, PaginaHilo, RolMensaje } from "./tipos";

// Mismo patrón que lib/medicamentos/nucleo.ts: funciones puras
// (supabase, usuarioId, ...) => resultado, sin acoplarse a la ruta de API
// ni a componentes — así la persistencia del historial no puede
// desincronizarse entre la UI y /api/chat.
type Cliente = SupabaseClient;

/** Mensajes por página al abrir el chat y al volver a subir. */
export const TAMANO_PAGINA_HILO = 30;

// Error de Postgres/PostgREST por una columna que no existe: la migración 035 todavía no se aplicó.
function esColumnaInexistente(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(error.message ?? "");
}

/**
 * Sesión donde se escribe el hilo único: la más reciente del usuario, o una nueva si no tiene ninguna.
 * El hilo es uno solo; la sesión sobrevive solo para no tocar la tabla ni las rutas que cuelgan de ella
 * (borrado de historial por fecha, exportación). Las sesiones viejas se leen mezcladas por fecha.
 */
export async function obtenerSesionDelHilo(supabase: Cliente, usuarioId: string): Promise<string> {
  const { data, error } = await supabase
    .from("sesiones_chat")
    .select("id")
    .eq("usuario_id", usuarioId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la sesión de chat: ${error.message}`);
  if (data) return data.id as string;
  return crearSesion(supabase, usuarioId);
}

async function crearSesion(supabase: Cliente, usuarioId: string): Promise<string> {
  const { data, error } = await supabase.from("sesiones_chat").insert({ usuario_id: usuarioId }).select("id").single();
  if (error) throw new Error(`No se pudo crear la sesión de chat: ${error.message}`);
  return data.id as string;
}

/**
 * Mensajes del usuario a través de TODAS sus sesiones, del más nuevo al más viejo por (created_at, id),
 * devueltos en orden ascendente. Con `antes`, solo los estrictamente anteriores a ese cursor.
 */
export async function listarHilo(
  supabase: Cliente,
  usuarioId: string,
  opciones: { limite?: number; antes?: CursorHilo | null } = {}
): Promise<PaginaHilo & { filas: MensajeChat[] }> {
  const limite = Math.max(1, Math.min(opciones.limite ?? TAMANO_PAGINA_HILO, 200));
  let consulta = supabase
    .from("mensajes_chat")
    .select("id, sesion_id, role, contenido, created_at")
    .eq("usuario_id", usuarioId);
  if (opciones.antes) consulta = consulta.or(filtroAnteriorA(opciones.antes));
  const { data, error } = await consulta
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite + 1);

  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`);
  const filas = (data ?? []) as MensajeChat[];
  const hayMas = filas.length > limite;
  const pagina = filas.slice(0, limite).reverse();
  return {
    filas: pagina,
    hayMas,
    mensajes: pagina.map((m) => ({ id: m.id, role: m.role, contenido: m.contenido, created_at: m.created_at })),
  };
}

export async function guardarMensaje(
  supabase: Cliente,
  usuarioId: string,
  sesionId: string,
  role: RolMensaje,
  contenido: string,
  extra: { bloques?: BloquesTurno; tokens?: number | null; pedidoId?: string } = {}
): Promise<void> {
  const base = { usuario_id: usuarioId, sesion_id: sesionId, role, contenido };
  const conMemoria = {
    ...base,
    ...(extra.bloques ? { bloques: extra.bloques } : {}),
    ...(extra.tokens != null && extra.tokens > 0 ? { tokens: extra.tokens } : {}),
    ...(extra.pedidoId ? { pedido_id: extra.pedidoId } : {}),
  };
  let { error } = await supabase.from("mensajes_chat").insert(conMemoria);
  // Sin la migración 035 las columnas nuevas no existen: se guarda igual como antes (nada se pierde del hilo).
  if (error && Object.keys(conMemoria).length > Object.keys(base).length && esColumnaInexistente(error)) {
    ({ error } = await supabase.from("mensajes_chat").insert(base));
  }

  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);

  // Toca updated_at de la sesión: la más reciente es donde sigue escribiéndose el hilo.
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
