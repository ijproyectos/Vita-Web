"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import { extraerDatosEstudio } from "@/lib/estudios/extraer";
import { TAMANIO_MAXIMO_BYTES } from "@/lib/estudios/tipos";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";

export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

// Sube la foto y, en el mismo request, la analiza con IA — fotos son
// chicas y la llamada a Anthropic tarda segundos, así que un solo
// "guardando…" alcanza (no hace falta un job en background). Si la
// extracción falla por lo que sea (imagen no legible, ANTHROPIC_API_KEY
// sin configurar, error de red), el estudio se guarda igual con
// estado='error' — la foto nunca se pierde, el usuario completa los
// datos a mano después si hace falta.
export async function subirEstudioAction(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const usuario = await requireUser();
  // Familia: el estudio es del perfil activo (carpeta `{id}/` del bucket); el
  // límite diario de IA lo consume la cuenta logueada, que es quien lo sube.
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const pid = destino.perfil.id;
  const supabase = await createClient();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { status: "error", message: "Sacá una foto o elegí un archivo primero." };
  }
  if (archivo.size > TAMANIO_MAXIMO_BYTES) {
    return { status: "error", message: "El archivo pesa más de 10 MB. Probá con una foto más liviana o un PDF más chico." };
  }

  try {
    const { path, tipo } = await estudiosNucleo.subirArchivo(supabase, pid, archivo);

    const bytes = await archivo.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const resultado = await extraerDatosEstudio(usuario.id, base64, tipo);

    await estudiosNucleo.agregar(supabase, pid, {
      archivoPath: path,
      archivoTipo: tipo,
      extraccion: resultado.ok ? resultado.datos : null,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar el estudio." };
  }

  revalidatePath("/app/mi-salud");
  return { status: "success" };
}

// Mismo contrato "nunca lanza" que el resto de las Server Actions del
// repo (EstadoAccion en rutina/actions.ts) — antes devolvía Promise<void>
// y podía tirar directo si eliminar() fallaba; hoy el único caller lo
// envuelve en su propio try/catch, pero cualquier caller futuro que no lo
// haga se llevaría una excepción sin manejar en vez del {status,message}
// que el resto del repo espera.
export async function eliminarEstudioAction(estudioId: string): Promise<EstadoAccion> {
  // requireUser fuera del try: su redirect("/login") lanza NEXT_REDIRECT y
  // el catch lo convertiría en un mensaje de error en vez de redirigir.
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  try {
    const supabase = await createClient();
    await estudiosNucleo.eliminar(supabase, destino.perfil.id, estudioId);
    revalidatePath("/app/mi-salud");
    return { status: "success" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo eliminar el estudio." };
  }
}
