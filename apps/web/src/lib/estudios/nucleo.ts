import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { TIPO_PDF, type Estudio, type EstudioConUrl, type DatosExtraidos, type EstadoValor, type ValorEstudio } from "./tipos";

type Cliente = SupabaseClient;

const BUCKET = "estudios";
const VENCIMIENTO_URL_SEGUNDOS = 3600; // 1 hora — suficiente para ver/revisar el estudio en la sesión actual

function extensionDeArchivo(nombre: string, tipo: string): string {
  const partes = nombre.split(".");
  if (partes.length > 1) return partes[partes.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return tipo === TIPO_PDF ? "pdf" : "jpg";
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
  const path = `${usuarioId}/${crypto.randomUUID()}.${extensionDeArchivo(archivo.name, archivo.type)}`;
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
  // Round-trip: `new Date("2026-02-31")` no es NaN (JS lo corre al 3 de
  // marzo) pero Postgres rechaza ese `date` y se perdería toda la extracción.
  const d = new Date(`${fecha}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha ? fecha : null;
}

const ESTADOS: readonly string[] = ["normal", "alto", "bajo"];

function textoOnull(v: unknown, max = 120): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function numeroOnull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// "13,2" -> 13.2, "7.400" -> 7400, "412.000" -> 412000, "14.2" -> 14.2. Un punto
// seguido de exactamente 3 dígitos es ambiguo (7.400 vs 7,400): se toma como
// miles (formato AR). Cualquier otra cosa no numérica -> null (no se deriva).
function numeroDeValor(valor: string): number | null {
  const v = valor.trim();
  let n: number;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) n = Number(v.replace(/\./g, "").replace(",", "."));
  else if (/^-?\d+(,\d+)?$/.test(v)) n = Number(v.replace(",", "."));
  else if (/^-?\d+\.\d+$/.test(v)) n = Number(v);
  else return null;
  return Number.isFinite(n) ? n : null;
}

// Lo que sale del modelo (y lo que ya está en la columna jsonb) es entrada no
// confiable: se normaliza antes de guardar y antes de mostrar. Estudios viejos
// ({nombre, valor} a secas) pasan sin campos extra. Si el modelo no marcó el
// estado pero imprimió un rango numérico, se deriva (aritmética sobre lo que
// dice el documento, nunca un rango propio).
export function normalizarValores(crudo: unknown): ValorEstudio[] {
  if (!Array.isArray(crudo)) return [];
  const salida: ValorEstudio[] = [];
  for (const item of crudo) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nombre = textoOnull(o.nombre);
    const valor = textoOnull(o.valor, 60) ?? (typeof o.valor === "number" ? String(o.valor) : null);
    if (!nombre || !valor) continue;
    const rango_min = numeroOnull(o.rango_min);
    const rango_max = numeroOnull(o.rango_max);
    let estado: EstadoValor | null = typeof o.estado === "string" && ESTADOS.includes(o.estado) ? (o.estado as EstadoValor) : null;
    if (!estado && (rango_min !== null || rango_max !== null)) {
      const n = numeroDeValor(valor);
      if (n !== null) estado = rango_min !== null && n < rango_min ? "bajo" : rango_max !== null && n > rango_max ? "alto" : "normal";
    }
    salida.push({
      nombre,
      valor,
      unidad: textoOnull(o.unidad, 30),
      rango_min,
      rango_max,
      rango_texto: textoOnull(o.rango_texto, 80),
      estado,
    });
  }
  return salida;
}

function faltaColumna(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* (does not exist|of relation)|schema cache/i.test(error.message ?? "");
}

export async function agregar(
  supabase: Cliente,
  usuarioId: string,
  datos: {
    archivoPath: string;
    archivoTipo: string;
    extraccion: DatosExtraidos | null; // null si la extracción falló — se guarda igual, solo la foto
    // Lo que el usuario confirmó en el paso de revisión (V7 "Nuevo estudio"):
    // pisa lo leído por la IA. `lugar` vive en la migración 026.
    nombre?: string | null;
    fecha?: string | null;
    lugar?: string | null;
  }
): Promise<Estudio> {
  const fila = {
    usuario_id: usuarioId,
    archivo_path: datos.archivoPath,
    archivo_tipo: datos.archivoTipo,
    tipo: textoOnull(datos.nombre, 120) ?? datos.extraccion?.tipo ?? null,
    fecha: fechaValidaOnull(datos.fecha !== undefined ? datos.fecha : (datos.extraccion?.fecha ?? null)),
    resumen: datos.extraccion?.resumen ?? null,
    valores: normalizarValores(datos.extraccion?.valores),
    estado: datos.extraccion ? "listo" : "error",
  };
  const lugar = textoOnull(datos.lugar, 120);

  let { data, error } = await supabase
    .from("estudios")
    .insert((lugar ? { ...fila, lugar } : fila) as Record<string, unknown>)
    .select()
    .single();
  // Sin la migración 026 el estudio se guarda igual, sin el lugar.
  if (error && lugar && faltaColumna(error)) {
    ({ data, error } = await supabase.from("estudios").insert(fila).select().single());
  }

  if (error) {
    // El archivo ya se subió — mejor un huérfano en Storage (limpiable a
    // mano después) que perder la foto que el usuario recién sacó.
    throw new Error(`No se pudo guardar el estudio: ${error.message}`);
  }
  return data as Estudio;
}

/** ¿Existe `estudios.lugar` (migración 026)? Nunca lanza. */
export async function lugarDisponible(supabase: Cliente): Promise<boolean> {
  const { error } = await supabase.from("estudios").select("lugar").limit(1);
  return !error;
}

/**
 * Borra un archivo subido que nunca llegó a guardarse como estudio (el usuario
 * tocó "Cambiar"). Solo dentro de la carpeta de la persona; best-effort.
 */
export async function descartarArchivo(supabase: Cliente, usuarioId: string, path: string): Promise<void> {
  if (!path.startsWith(`${usuarioId}/`) || path.includes("..")) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export function esRutaDe(usuarioId: string, path: string): boolean {
  return path.startsWith(`${usuarioId}/`) && !path.includes("..");
}

export async function listar(supabase: Cliente, usuarioId: string): Promise<EstudioConUrl[]> {
  const { data, error } = await supabase
    .from("estudios")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los estudios: ${error.message}`);
  const estudios = (data as Estudio[]).map((e) => ({ ...e, valores: normalizarValores(e.valores) }));

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

export async function obtener(
  supabase: Cliente,
  usuarioId: string,
  estudioId: string
): Promise<EstudioConUrl | null> {
  const { data, error } = await supabase
    .from("estudios")
    .select("*")
    .eq("id", estudioId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el estudio: ${error.message}`);
  if (!data) return null;
  const estudio = { ...(data as Estudio), valores: normalizarValores((data as Estudio).valores) };

  const { data: firmada } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(estudio.archivo_path, VENCIMIENTO_URL_SEGUNDOS);
  return { ...estudio, urlFirmada: firmada?.signedUrl ?? null };
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
