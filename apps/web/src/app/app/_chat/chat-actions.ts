"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as chat from "@/lib/chat/nucleo";
import { obtenerUsoHoy } from "@/lib/uso-ia/nucleo";
import type { UsoDiarioConEstado } from "@/lib/uso-ia/tipos";
import type { MensajeChat } from "@/lib/chat/tipos";
import { deshacerMemoria } from "@/lib/memoria/nucleo";
import { esMotivoValido, faltaTablaValoraciones } from "@/lib/chat/valoraciones";

// Server Actions consumidas por el overlay de chat (componente cliente,
// no una página) — reemplazan el fetch en el server component que hacía
// el viejo /app/chat/page.tsx.

export type PaginaHilo =
  | { status: "success"; mensajes: MensajeChat[]; hayMas: boolean }
  | { status: "error" };

const FECHA_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;

/**
 * Página del hilo continuo (últimos 7 días, todas las sesiones). Sin `antesDe` trae lo más reciente; con
 * `antesDe` (created_at del más viejo que ya se ve) trae la página anterior. Nunca lanza.
 */
export async function cargarHiloAction(antesDe?: string): Promise<PaginaHilo> {
  try {
    if (antesDe !== undefined && (typeof antesDe !== "string" || !FECHA_RE.test(antesDe) || Number.isNaN(Date.parse(antesDe)))) {
      return { status: "error" };
    }
    const usuario = await requireUser();
    const supabase = await createClient();
    const { mensajes, hayMas } = await chat.listarHilo(supabase, usuario.id, { antesDe });
    return { status: "success", mensajes, hayMas };
  } catch {
    return { status: "error" };
  }
}

// Uso diario de IA para el indicador del chat. Nunca lanza: null = ocultar.
export async function obtenerUsoHoyAction(): Promise<UsoDiarioConEstado | null> {
  const usuario = await requireUser();
  return obtenerUsoHoy(usuario.id);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Deshacer" de la tarjeta de un recuerdo recién guardado. Con la sesión del usuario (RLS owner-only): el
 * recuerdo queda borrado sin texto y, si corregía a otro, el anterior vuelve a estar vigente. Nunca lanza.
 */
export async function deshacerMemoriaAction(
  id: string
): Promise<{ status: "success"; restaurado: boolean } | { status: "error"; mensaje: string }> {
  const error = { status: "error" as const, mensaje: "No pude deshacerlo. Probá de nuevo o borralo desde Privacidad." };
  try {
    if (typeof id !== "string" || !UUID_RE.test(id)) return error;
    const usuario = await requireUser();
    const supabase = await createClient();
    const r = await deshacerMemoria(supabase, usuario.id, id);
    // 'restauracion_fallida': el nuevo ya no se recuerda pero el anterior no volvió; no se dice que se volvió atrás.
    if (r === "ok") return { status: "success", restaurado: true };
    if (r === "restauracion_fallida") return { status: "success", restaurado: false };
    return r === "no_encontrado" ? { status: "error", mensaje: "Ese recuerdo ya cambió o se borró: mirá cómo quedó en Privacidad." } : error;
  } catch {
    return error;
  }
}

/**
 * 👍/👎 a una respuesta de vita (migración 060). `valor` 0 quita la valoración. Sesión del usuario (RLS: solo mensajes del
 * asistente propios). Sin la tabla devuelve `noDisponible` y el cliente esconde los botones. Nunca lanza.
 */
export async function valorarRespuestaAction(
  mensajeId: string,
  valor: 1 | -1 | 0,
  motivo?: string
): Promise<{ status: "success" } | { status: "error"; noDisponible?: boolean }> {
  try {
    if (typeof mensajeId !== "string" || !UUID_RE.test(mensajeId)) return { status: "error" };
    if (valor !== 1 && valor !== -1 && valor !== 0) return { status: "error" };
    const usuario = await requireUser();
    const supabase = await createClient();
    if (valor === 0) {
      const { error } = await supabase.from("chat_valoraciones").delete().eq("usuario_id", usuario.id).eq("mensaje_id", mensajeId);
      if (error) return { status: "error", noDisponible: faltaTablaValoraciones(error) };
      return { status: "success" };
    }
    const motivoLimpio = valor === -1 && esMotivoValido(motivo) ? motivo : null;
    const { error } = await supabase
      .from("chat_valoraciones")
      .upsert(
        { usuario_id: usuario.id, mensaje_id: mensajeId, valor, motivo: motivoLimpio, updated_at: new Date().toISOString() },
        { onConflict: "usuario_id,mensaje_id" }
      );
    if (error) return { status: "error", noDisponible: faltaTablaValoraciones(error) };
    return { status: "success" };
  } catch {
    return { status: "error" };
  }
}
