"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import { extraerDatosEstudio, TIPOS_SOPORTADOS } from "@/lib/estudios/extraer";
import { TAMANIO_MAXIMO_BYTES, type DatosExtraidos } from "@/lib/estudios/tipos";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";
import type { EstadoAccion } from "@/app/app/rutina/actions";

export type ResultadoAnalisis =
  | { status: "success"; path: string; tipo: string; datos: DatosExtraidos | null }
  | { status: "error"; message: string };

/**
 * Paso 1 del alta (V7 "Nuevo estudio"): sube el archivo y lo lee con IA, pero
 * todavía NO crea el estudio: el usuario revisa nombre/fecha/lugar y recién
 * ahí se guarda. El archivo queda en Storage desde ya, así que si cierra la
 * pantalla no se pierde (como mucho queda un huérfano limpiable). Si la IA
 * falla, `datos` es null y el usuario completa a mano.
 */
export async function analizarEstudioAction(formData: FormData): Promise<ResultadoAnalisis> {
  const usuario = await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { status: "error", message: "Sacá una foto o elegí un archivo primero." };
  }
  if (archivo.size > TAMANIO_MAXIMO_BYTES) {
    return { status: "error", message: "El archivo pesa más de 10 MB. Probá con una foto más liviana o un PDF más chico." };
  }
  // Nunca se sube un formato que la IA no puede leer (HEIC, etc.).
  if (!TIPOS_SOPORTADOS.includes(archivo.type)) {
    return { status: "error", message: "Ese formato no lo puedo leer. Probá con una foto JPG/PNG o un PDF." };
  }
  try {
    const supabase = await createClient();
    const { path, tipo } = await estudiosNucleo.subirArchivo(supabase, destino.perfil.id, archivo);
    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
    const resultado = await extraerDatosEstudio(usuario.id, base64, tipo);
    return { status: "success", path, tipo, datos: resultado.ok ? estudiosNucleo.sanearExtraccion(resultado.datos) : null };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo subir el estudio." };
  }
}

export type DatosGuardarEstudio = {
  path: string;
  tipo: string;
  nombre: string;
  /** "YYYY-MM-DD" o "". */
  fecha: string;
  lugar: string;
  /** Lo que leyó la IA en el paso 1 (resumen y valores); null si no pudo leer. */
  extraccion: DatosExtraidos | null;
};

/** Paso 2: guarda el estudio con lo que el usuario confirmó. */
export async function guardarEstudioAction(datos: DatosGuardarEstudio): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const pid = destino.perfil.id;
  // Todo lo que llega del cliente se re-valida acá: nunca se confía en el form.
  if (!datos || typeof datos !== "object" || typeof datos.path !== "string" || datos.path.length > 300 || !estudiosNucleo.esRutaDe(pid, datos.path)) {
    return { status: "error", message: "Ese archivo no es de esta persona." };
  }
  if (typeof datos.tipo !== "string" || !TIPOS_SOPORTADOS.includes(datos.tipo)) {
    return { status: "error", message: "Ese tipo de archivo no está soportado." };
  }
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  try {
    const supabase = await createClient();
    await estudiosNucleo.agregar(supabase, pid, {
      archivoPath: datos.path,
      archivoTipo: datos.tipo,
      extraccion: estudiosNucleo.sanearExtraccion(datos.extraccion),
      nombre: texto(datos.nombre, 120).trim() || null,
      fecha: texto(datos.fecha, 10).trim() || null,
      lugar: texto(datos.lugar, 120).trim() || null,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar el estudio." };
  }
  revalidatePath("/app/mi-salud");
  return { status: "success" };
}

/** "Cambiar": el archivo subido en el paso 1 y nunca guardado se descarta. Nunca lanza. */
export async function descartarArchivoEstudioAction(path: string): Promise<void> {
  await requireUser();
  try {
    const destino = await perfilActivoEditable();
    if (!destino.ok) return;
    await estudiosNucleo.descartarArchivo(await createClient(), destino.perfil.id, path);
  } catch {
    /* best-effort */
  }
}

// Mismo contrato "nunca lanza" que el resto de las Server Actions del
// repo (EstadoAccion en rutina/actions.ts): el caller recibe {status,message}
// en vez de una excepción sin manejar si eliminar() falla.
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
