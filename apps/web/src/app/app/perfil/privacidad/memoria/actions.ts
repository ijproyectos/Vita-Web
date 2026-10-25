"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { pedirRegeneracion } from "@/lib/memoria/resumen";
import {
  cambiarMemoriaActiva,
  corregirRecuerdo,
  olvidarRecuerdo,
  olvidarTodo,
  previaOlvido,
  type PreviaOlvido,
} from "@/lib/memoria/privacidad";

// Pantalla "Lo que vita recuerda de vos". Todo sobre el usuario de la SESIÓN (el id nunca viene del cliente) y con el
// cliente de sesión (RLS owner-only). Nunca lanzan.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_GENERICO = "No se pudo. Probá de nuevo en un rato.";

type Resultado = { status: "success"; mensaje?: string } | { status: "error"; mensaje: string };

function refrescar() {
  revalidatePath("/app/perfil/privacidad/memoria");
}

export async function cambiarMemoriaActivaAction(activa: boolean): Promise<Resultado> {
  const usuario = await requireUser();
  if (typeof activa !== "boolean") return { status: "error", mensaje: ERROR_GENERICO };
  try {
    const supabase = await createClient();
    if (!(await cambiarMemoriaActiva(supabase, usuario.id, activa))) return { status: "error", mensaje: "No se pudo guardar el cambio." };
    refrescar();
    return { status: "success" };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}

export async function corregirRecuerdoAction(id: string, texto: string): Promise<Resultado> {
  const usuario = await requireUser();
  if (typeof id !== "string" || !UUID_RE.test(id)) return { status: "error", mensaje: ERROR_GENERICO };
  try {
    const supabase = await createClient();
    const r = await corregirRecuerdo(supabase, usuario.id, id, texto);
    if (r === "ok" || r === "igual") {
      refrescar();
      return { status: "success" };
    }
    const mensajes: Record<string, string> = {
      texto_vacio: "Escribí qué querés que recuerde.",
      texto_largo: "Es muy largo: resumilo en una oración corta.",
      no_encontrado: "Ese recuerdo ya cambió o se borró. Actualizá la pantalla.",
    };
    return { status: "error", mensaje: mensajes[r] ?? ERROR_GENERICO };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}

export async function previaOlvidoAction(id: string): Promise<{ status: "success"; previa: PreviaOlvido } | { status: "error"; mensaje: string }> {
  const usuario = await requireUser();
  if (typeof id !== "string" || !UUID_RE.test(id)) return { status: "error", mensaje: ERROR_GENERICO };
  try {
    const supabase = await createClient();
    const previa = await previaOlvido(supabase, usuario.id, id);
    return previa ? { status: "success", previa } : { status: "error", mensaje: "No pude ver de dónde salió este recuerdo." };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}

/** `modo`: 'dejar' = dejar de recordar (los mensajes quedan en el historial pero excluidos); 'eliminar' = se borran también. */
export async function olvidarRecuerdoAction(id: string, modo: string, mensajeIds: string[]): Promise<Resultado> {
  const usuario = await requireUser();
  if (typeof id !== "string" || !UUID_RE.test(id) || (modo !== "dejar" && modo !== "eliminar") || !Array.isArray(mensajeIds)) {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
  try {
    const supabase = await createClient();
    const r = await olvidarRecuerdo(supabase, usuario.id, id, modo === "eliminar", mensajeIds.filter((m): m is string => typeof m === "string"));
    if (r.estado === "no_encontrado") return { status: "error", mensaje: "Ese recuerdo ya cambió o se borró. Actualizá la pantalla." };
    if (r.estado === "error") return { status: "error", mensaje: ERROR_GENERICO };
    // El resumen quedó invalidado: se rearma en segundo plano sin esos datos (si esto falla, el chat o el cron lo piden).
    after(() => pedirRegeneracion(usuario.id));
    refrescar();
    revalidatePath("/app", "layout");
    return { status: "success" };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}

export async function borrarTodoMemoriaAction(confirmacion: string): Promise<Resultado> {
  const usuario = await requireUser();
  if (typeof confirmacion !== "string" || confirmacion.trim().toUpperCase() !== "BORRAR") {
    return { status: "error", mensaje: "Escribí BORRAR para confirmar." };
  }
  try {
    const supabase = await createClient();
    const r = await olvidarTodo(supabase, usuario.id);
    if (!r.ok) return { status: "error", mensaje: ERROR_GENERICO };
    // Sin regenerar: el resumen queda en blanco y vita retoma desde acá (rearmarlo desde los mensajes volvería a escribir
    // lo que se acaba de borrar).
    refrescar();
    return { status: "success" };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}
