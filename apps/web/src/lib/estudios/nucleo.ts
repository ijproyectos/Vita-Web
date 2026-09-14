import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Estudio, EstudioConUrl, DatosExtraidos } from "./tipos";

type Cliente = SupabaseClient;

const BUCKET = "estudios";
const VENCIMIENTO_URL_SEGUNDOS = 3600; // 1 hora — suficiente para ver/revisar el estudio en la sesión actual

function extensionDeArchivo(nombre: string): string {
  const partes = nombre.split(".");
  return partes.length > 1 ? partes[partes.length - 1].toLowerCase() : "jpg";
}

/**
 * Sube la foto a Storage y devuelve su path — no inserta la fila todavía
 * (eso lo hace `agregar`, una vez que se sabe si la extracción funcionó).
 */
export async function subirArchivo(
  supabase: Cliente,
  usuarioId: string,
  archivo: File
): Promise<{ path: string; tipo: string }> {
  const path = `${usuarioId}/${crypto.randomUUID()}.${extensionDeArchivo(archivo.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, archivo, {
    contentType: archivo.type,
    upsert: false,
  });

  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return { path, tipo: archivo.type };
}

const FECHA_ISO_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// El schema de zod de extraer.ts solo le PIDE al modelo formato YYYY-MM-DD
// en la descripción — no lo valida. Si el modelo devuelve otra cosa
// (texto libre, un año suelto, una fecha en otro formato) y esto se manda
// tal cual a la columna `date`, el insert entero falla — con el archivo
// ya subido a Storage y todo el resto de la extracción (tipo/resumen/
// valores, que sí eran válidos) perdido junto con él. Mejor descartar
// solo la fecha si no es parseable como fecha real, no todo el estudio.
function fechaValidaOnull(fecha: string | null): string | null {
  if (!fecha || !FECHA_ISO_VALIDA.test(fecha)) return null;
  return isNaN(new Date(fecha).getTime()) ? null : fecha;
}

export async function agregar(
  supabase: Cliente,
  usuarioId: string,
  datos: {
    archivoPath: string;
    archivoTipo: string;
    extraccion: DatosExtraidos | null; // null si la extracción falló — se guarda igual, solo la foto
  }
): Promise<Estudio> {
  const { data, error } = await supabase
    .from("estudios")
    .insert({
      usuario_id: usuarioId,
      archivo_path: datos.archivoPath,
      archivo_tipo: datos.archivoTipo,
      tipo: datos.extraccion?.tipo ?? null,
      fecha: fechaValidaOnull(datos.extraccion?.fecha ?? null),
      resumen: datos.extraccion?.resumen ?? null,
      valores: datos.extraccion?.valores ?? [],
      estado: datos.extraccion ? "listo" : "error",
    })
    .select()
    .single();

  if (error) {
    // El archivo ya se subió — mejor un huérfano en Storage (limpiable a
    // mano después) que perder la foto que el usuario recién sacó.
    throw new Error(`No se pudo guardar el estudio: ${error.message}`);
  }
  return data as Estudio;
}

export async function listar(supabase: Cliente, usuarioId: string): Promise<EstudioConUrl[]> {
  const { data, error } = await supabase
    .from("estudios")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los estudios: ${error.message}`);
  const estudios = data as Estudio[];

  const conUrl = await Promise.all(
    estudios.map(async (e) => {
      const { data: firmada } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(e.archivo_path, VENCIMIENTO_URL_SEGUNDOS);
      return { ...e, urlFirmada: firmada?.signedUrl ?? null };
    })
  );

  return conUrl;
}

export async function eliminar(supabase: Cliente, usuarioId: string, estudioId: string): Promise<void> {
  const { data: estudio, error: errorLectura } = await supabase
    .from("estudios")
    .select("archivo_path")
    .eq("id", estudioId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (errorLectura) throw new Error(`No se pudo leer el estudio: ${errorLectura.message}`);
  if (!estudio) return;

  const { error } = await supabase.from("estudios").delete().eq("id", estudioId).eq("usuario_id", usuarioId);
  if (error) throw new Error(`No se pudo eliminar el estudio: ${error.message}`);

  // Best-effort — si esto falla, queda un archivo huérfano en Storage,
  // no un dato roto en la app (mismo criterio que el resto del proyecto).
  await supabase.storage.from(BUCKET).remove([estudio.archivo_path]);
}
