"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { descartarObservacion, marcarVistas } from "./nucleo";

// Server Actions de las observaciones de vita. Nunca lanzan (requireUser queda fuera del try porque redirige
// lanzando un error de control de Next). Todo va con el cliente de sesión: la RLS decide quién puede marcar o
// descartar (el dueño y un cuidador con rol Admin; un Lector no).
export type EstadoObservacion = { status: "success" } | { status: "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 20;

export async function descartarObservacionAction(id: string): Promise<EstadoObservacion> {
  await requireUser();
  if (typeof id !== "string" || !UUID.test(id)) return { status: "error", message: "La observación no es válida." };
  try {
    const supabase = await createClient();
    const r = await descartarObservacion(supabase, id);
    if (!r.ok) return { status: "error", message: "No pudimos ocultar esta observación. Probá de nuevo." };
  } catch {
    return { status: "error", message: "No pudimos ocultar esta observación. Probá de nuevo." };
  }
  revalidatePath("/app");
  revalidatePath("/app/observaciones");
  return { status: "success" };
}

/** Marca como vistas las observaciones que se mostraron. Best-effort: un fallo no se le muestra a nadie. */
export async function marcarObservacionesVistasAction(ids: string[]): Promise<EstadoObservacion> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return { status: "error", message: "Las observaciones no son válidas." };
  }
  try {
    const supabase = await createClient();
    return (await marcarVistas(supabase, ids)) ? { status: "success" } : { status: "error", message: "No se pudo marcar." };
  } catch {
    return { status: "error", message: "No se pudo marcar." };
  }
}
