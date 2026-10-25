"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as chat from "@/lib/chat/nucleo";
import { parsearCursor } from "@/lib/chat/cursor";
import { obtenerUsoHoy } from "@/lib/uso-ia/nucleo";
import type { UsoDiarioConEstado } from "@/lib/uso-ia/tipos";
import type { PaginaHilo } from "@/lib/chat/tipos";

// Server Actions consumidas por el overlay de chat (componente cliente,
// no una página) — reemplazan el fetch en el server component que hacía
// el viejo /app/chat/page.tsx.

export type ResultadoHilo = ({ status: "success" } & PaginaHilo) | { status: "error"; mensaje: string };

/**
 * Una página del hilo único del usuario (todas sus sesiones mezcladas por fecha). Sin `antes` devuelve
 * lo más reciente; con `antes` (cursor `{created_at, id}` del mensaje más viejo ya cargado), la página
 * anterior. Corre con la sesión del usuario (RLS). Nunca lanza.
 */
export async function listarHiloAction(antes?: unknown): Promise<ResultadoHilo> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();
    const cursor = antes == null ? null : parsearCursor(antes);
    if (antes != null && !cursor) return { status: "error", mensaje: "No se pudo leer la conversación." };
    const pagina = await chat.listarHilo(supabase, usuario.id, { antes: cursor });
    return { status: "success", mensajes: pagina.mensajes, hayMas: pagina.hayMas };
  } catch {
    return { status: "error", mensaje: "No se pudo leer la conversación." };
  }
}

// Uso diario de IA para el indicador del chat. Nunca lanza: null = ocultar.
export async function obtenerUsoHoyAction(): Promise<UsoDiarioConEstado | null> {
  const usuario = await requireUser();
  return obtenerUsoHoy(usuario.id);
}
