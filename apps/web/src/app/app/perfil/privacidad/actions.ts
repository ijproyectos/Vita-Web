"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pedirRegeneracion } from "@/lib/memoria/resumen";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { borrarHistorial } from "@/lib/historial/nucleo";
import { esRangoBorrado, type EstadoBorrado } from "@/lib/historial/tipos";

// Borrar historial (V7): SOLO el del usuario logueado — el id sale de la sesión,
// nunca de un parámetro. Nunca lanza.
export async function borrarHistorialAction(rango: string, confirmacion: string): Promise<EstadoBorrado> {
  const usuario = await requireUser(); // fuera del try: redirige a /login sin sesión
  if (!esRangoBorrado(rango)) return { status: "error", mensaje: "Elegí qué período borrar." };
  if (confirmacion.trim().toUpperCase() !== "BORRAR") return { status: "error", mensaje: "Escribí BORRAR para confirmar." };

  try {
    const supabase = await createClient();
    const borrado = await borrarHistorial(supabase, usuario.id, rango);
    revalidatePath("/app", "layout");
    // El resumen del chat quedó invalidado: se rearma en segundo plano con lo que quedó (el cron lo toma si esto falla).
    if (borrado.resumenInvalidado) after(() => pedirRegeneracion(usuario.id));
    return { status: "success", borrado };
  } catch (e) {
    return { status: "error", mensaje: e instanceof Error ? e.message : "No se pudo borrar el historial." };
  }
}
