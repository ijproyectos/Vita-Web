"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { cambiarMemoriaActiva, olvidarRecuerdo, olvidarTodo } from "@/lib/memoria/privacidad";

// Pantalla "Lo que vita recuerda de vos". Todo sobre el usuario de la SESIÓN (el id nunca viene del cliente) y con el
// cliente de sesión (RLS owner-only). Nunca lanzan.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_GENERICO = "No se pudo. Probá de nuevo en un rato.";

type Resultado = { status: "success" } | { status: "error"; mensaje: string };

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

/** Dejar de recordar un recuerdo: queda borrado sin texto y sus mensajes de origen quedan fuera de la memoria. */
export async function olvidarRecuerdoAction(id: string): Promise<Resultado> {
  const usuario = await requireUser();
  if (typeof id !== "string" || !UUID_RE.test(id)) return { status: "error", mensaje: ERROR_GENERICO };
  try {
    const supabase = await createClient();
    const r = await olvidarRecuerdo(supabase, usuario.id, id);
    if (r.estado === "no_encontrado") return { status: "error", mensaje: "Ese recuerdo ya cambió o se borró. Actualizá la pantalla." };
    if (r.estado === "error") return { status: "error", mensaje: ERROR_GENERICO };
    refrescar();
    return { status: "success" };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}

/** Olvidar todo: borra todos los recuerdos y saca todos los mensajes de la memoria (siguen visibles en el chat). */
export async function olvidarTodoAction(confirmacion: string): Promise<Resultado> {
  const usuario = await requireUser();
  if (typeof confirmacion !== "string" || confirmacion.trim().toUpperCase() !== "BORRAR") {
    return { status: "error", mensaje: "Escribí BORRAR para confirmar." };
  }
  try {
    const supabase = await createClient();
    const r = await olvidarTodo(supabase, usuario.id);
    if (!r.ok) return { status: "error", mensaje: ERROR_GENERICO };
    refrescar();
    return { status: "success" };
  } catch {
    return { status: "error", mensaje: ERROR_GENERICO };
  }
}
