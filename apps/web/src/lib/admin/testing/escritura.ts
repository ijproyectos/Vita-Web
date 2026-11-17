import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "../acceso";
import { registrarAccionAdmin } from "../auditoria";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { BUCKET_ADJUNTOS, esPersonaDelEquipo } from "./datos";
import {
  cambiosDeBug,
  entero,
  esBugCerrado,
  nombreSeguro,
  puedePasarBug,
  rutaAdjuntoValida,
  texto,
  validarAdjunto,
  validarBug,
  validarPrueba,
  validarReporte,
  validarRonda,
  ESTADOS_BUG,
  type Bug,
  type DatosBug,
  type EstadoBug,
} from "./logica";

// Escritura del módulo Testing. Toda función recibe el `Admin` de `requireAdmin()` (que llama la Server Action) y recién
// entonces crea el cliente `service_role`. Nunca lanza. La auditoría (`admin_acciones`) guarda solo códigos y ids: nunca los
// textos libres de los bugs, reportes ni comentarios.

export type Fallo = { ok: false; mensaje: string };
export type Resultado<T extends object = object> = ({ ok: true; mensaje: string } & T) | Fallo;

const FALLO = "No pudimos guardar. Revisá que la migración 063 esté aplicada y probá de nuevo.";
const sinPermiso = (m: string): Fallo => ({ ok: false, mensaje: m });

async function db() {
  return createAdminClient();
}

async function personasValidas(admin: Admin, ...emails: (string | null)[]): Promise<boolean> {
  for (const e of emails) if (e !== null && !(await esPersonaDelEquipo(admin, e))) return false;
  return true;
}

// --- Pruebas ---------------------------------------------------------------------------------------------------------

export async function registrarPrueba(
  admin: Admin,
  e: { casoId: unknown; asignacionId: unknown; estado: unknown; resultado: unknown; dispositivo: unknown },
): Promise<Resultado<{ pruebaId: number }>> {
  const v = validarPrueba({ estado: e.estado, resultado: e.resultado, dispositivo: e.dispositivo });
  if (!v.ok) return v;
  try {
    const cliente = await db();
    let casoId = entero(e.casoId);
    let rondaId: number | null = null;
    let asignacionId: number | null = null;
    if (e.asignacionId !== null && e.asignacionId !== undefined && e.asignacionId !== "") {
      asignacionId = entero(e.asignacionId);
      if (asignacionId === null) return sinPermiso("La asignación no es válida.");
      const { data } = await cliente.from("track_asignaciones").select("id, caso_id, ronda_id, admin_email").eq("id", asignacionId).maybeSingle();
      const a = data as { id: number; caso_id: number; ronda_id: number; admin_email: string | null } | null;
      if (!a) return sinPermiso("Esa asignación ya no existe.");
      if (a.admin_email !== null && a.admin_email !== admin.email) return sinPermiso("Esa prueba le toca a otra persona.");
      const r = await cliente.from("track_rondas").select("estado").eq("id", a.ronda_id).maybeSingle();
      if ((r.data as { estado: string } | null)?.estado !== "activa") return sinPermiso("La ronda está cerrada.");
      casoId = a.caso_id;
      rondaId = a.ronda_id;
    }
    if (casoId === null) return sinPermiso("El caso no es válido.");
    const { data, error } = await cliente
      .from("track_pruebas")
      .insert({
        caso_id: casoId,
        estado: v.datos.estado,
        resultado: v.datos.resultado,
        dispositivo: v.datos.dispositivo,
        admin_email: admin.email,
        ronda_id: rondaId,
        asignacion_id: asignacionId,
        fecha: fechaISOEnAR(),
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, mensaje: error?.code === "23503" ? "Ese caso ya no existe." : FALLO };
    return { ok: true, mensaje: "Prueba registrada.", pruebaId: (data as { id: number }).id };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

// --- Bugs ------------------------------------------------------------------------------------------------------------

async function insertarBug(admin: Admin, datos: DatosBug, origen: { pruebaId?: number; reporteId?: number }): Promise<Resultado<{ bugId: number; codigo: string }>> {
  if (!(await personasValidas(admin, datos.responsable_email, datos.recibido_por_email))) return sinPermiso("Elegí personas del equipo.");
  try {
    const cliente = await db();
    const { data, error } = await cliente.from("track_bugs").insert({ ...datos, creado_por: admin.email }).select("id, codigo").single();
    if (error || !data) return { ok: false, mensaje: error?.code === "23503" ? "Ese caso ya no existe." : FALLO };
    const bug = data as { id: number; codigo: string };
    const partes = [
      datos.reportado_por ? `Reportado por ${datos.reportado_por}` : "",
      datos.recibido_por_email ? `Se lo contó a ${datos.recibido_por_email}` : "",
      datos.responsable_email ? `Lo arregla ${datos.responsable_email}` : "",
    ].filter(Boolean);
    await cliente.from("track_bug_eventos").insert({ bug_id: bug.id, actor_email: admin.email, accion: "creado", cuerpo: partes.join(" · ").slice(0, 2000) });
    if (origen.pruebaId) await cliente.from("track_pruebas").update({ bug_id: bug.id }).eq("id", origen.pruebaId);
    if (origen.reporteId) await cliente.from("track_reportes").update({ bug_id: bug.id }).eq("id", origen.reporteId);
    await registrarAccionAdmin(admin.email, "track_bug_creado", bug.codigo, { severidad: datos.severidad });
    return { ok: true, mensaje: `${bug.codigo} creado.`, bugId: bug.id, codigo: bug.codigo };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function crearBug(admin: Admin, crudo: Record<string, unknown>, reporteId?: number): Promise<Resultado<{ bugId: number; codigo: string }>> {
  const v = validarBug(crudo);
  if (!v.ok) return v;
  return insertarBug(admin, { ...v.datos, reportado_por: v.datos.reportado_por || "", recibido_por_email: v.datos.recibido_por_email ?? admin.email }, { reporteId });
}

/** Un clic: el bug sale de una prueba que falló (con los datos del caso y de la prueba) y queda vinculado a ella. */
export async function crearBugDesdePrueba(admin: Admin, pruebaId: number): Promise<Resultado<{ bugId: number; codigo: string }>> {
  try {
    const cliente = await db();
    const { data } = await cliente.from("track_pruebas").select("id, caso_id, estado, resultado, dispositivo, admin_email, bug_id").eq("id", pruebaId).maybeSingle();
    const p = data as { id: number; caso_id: number; estado: string; resultado: string; dispositivo: string; admin_email: string; bug_id: number | null } | null;
    if (!p) return sinPermiso("Esa prueba ya no existe.");
    if (p.estado !== "Falla") return sinPermiso("Solo una prueba que falló puede abrir un bug.");
    if (p.bug_id !== null) return sinPermiso("Esa prueba ya tiene un bug.");
    const c = await cliente.from("track_casos").select("*").eq("id", p.caso_id).maybeSingle();
    const caso = c.data as { id: number; funcionalidad: string; prioridad: string; precondicion: string; pasos: string; esperado: string } | null;
    if (!caso) return sinPermiso("El caso ya no existe.");
    const v = validarBug({
      titulo: `${caso.funcionalidad}: ${p.resultado.split("\n")[0]?.slice(0, 80) || "falla"}`,
      pasos: [caso.precondicion && `Antes: ${caso.precondicion}`, caso.pasos].filter(Boolean).join("\n"),
      actual: p.resultado,
      esperado: caso.esperado,
      dispositivo: p.dispositivo,
      severidad: caso.prioridad === "Alta" ? "Alta" : "Media",
      reportado_por: p.admin_email,
      recibido_por_email: admin.email,
      caso_id: String(caso.id),
    });
    if (!v.ok) return v;
    return insertarBug(admin, v.datos, { pruebaId: p.id });
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function actualizarBug(admin: Admin, id: number, estadoCrudo: unknown, crudo: Record<string, unknown>): Promise<Resultado> {
  const v = validarBug(crudo);
  if (!v.ok) return v;
  const estado = typeof estadoCrudo === "string" && (ESTADOS_BUG as readonly string[]).includes(estadoCrudo) ? (estadoCrudo as EstadoBug) : null;
  if (!estado) return sinPermiso("Elegí el estado del bug.");
  if (!(await personasValidas(admin, v.datos.responsable_email, v.datos.recibido_por_email))) return sinPermiso("Elegí personas del equipo.");
  try {
    const cliente = await db();
    const { data } = await cliente.from("track_bugs").select("*").eq("id", id).maybeSingle();
    const antes = data as Bug | null;
    if (!antes) return sinPermiso("Ese bug ya no existe.");
    if (!puedePasarBug(antes.estado, estado)) return sinPermiso(`Un bug ${antes.estado.toLowerCase()} no puede pasar a ${estado.toLowerCase()} directamente.`);
    const { data: nuevo, error } = await cliente.from("track_bugs").update({ ...v.datos, estado }).eq("id", id).eq("estado", antes.estado).select("*").maybeSingle();
    if (error) return { ok: false, mensaje: error.code === "23503" ? "Ese caso ya no existe." : FALLO };
    if (!nuevo) return sinPermiso("Alguien más cambió este bug. Recargá y probá de nuevo.");
    const cambios = cambiosDeBug(antes, nuevo as Bug);
    if (cambios.length > 0) {
      await cliente.from("track_bug_eventos").insert(
        cambios.map((c) => ({ bug_id: id, actor_email: admin.email, accion: "cambio", campo: c.campo, valor_anterior: c.anterior, valor_nuevo: c.nuevo })),
      );
    }
    if (esBugCerrado(estado) && !esBugCerrado(antes.estado)) await registrarAccionAdmin(admin.email, "track_bug_cerrado", antes.codigo, { estado });
    return { ok: true, mensaje: "Bug actualizado." };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function comentarBug(admin: Admin, bugId: number, cuerpoCrudo: unknown): Promise<Resultado> {
  const cuerpo = texto(cuerpoCrudo, 2000);
  if (cuerpo === "") return sinPermiso("Escribí el comentario.");
  try {
    const { error } = await (await db()).from("track_bug_eventos").insert({ bug_id: bugId, actor_email: admin.email, accion: "comentario", cuerpo });
    return error ? { ok: false, mensaje: error.code === "23503" ? "Ese bug ya no existe." : FALLO } : { ok: true, mensaje: "Comentario agregado." };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

/** Cada admin borra solo sus propios comentarios; el resto del historial es inalterable. */
export async function borrarComentario(admin: Admin, eventoId: number): Promise<Resultado> {
  try {
    const { data, error } = await (await db())
      .from("track_bug_eventos")
      .delete()
      .eq("id", eventoId)
      .eq("accion", "comentario")
      .eq("actor_email", admin.email)
      .select("id");
    if (error) return { ok: false, mensaje: FALLO };
    return (data ?? []).length > 0 ? { ok: true, mensaje: "Comentario borrado." } : sinPermiso("Solo podés borrar tus propios comentarios.");
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

// --- Rondas ----------------------------------------------------------------------------------------------------------

export async function crearRonda(admin: Admin, crudo: Record<string, unknown>): Promise<Resultado<{ rondaId: number }>> {
  const v = validarRonda(crudo, fechaISOEnAR());
  if (!v.ok) return v;
  try {
    const { data, error } = await (await db()).from("track_rondas").insert({ ...v.datos, creada_por: admin.email }).select("id").single();
    if (error || !data) return { ok: false, mensaje: FALLO };
    const id = (data as { id: number }).id;
    await registrarAccionAdmin(admin.email, "track_ronda_creada", String(id), {});
    return { ok: true, mensaje: "Ronda creada.", rondaId: id };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function cambiarEstadoRonda(admin: Admin, id: number, estado: "activa" | "cerrada"): Promise<Resultado> {
  try {
    const { data, error } = await (await db())
      .from("track_rondas")
      .update({ estado, ...(estado === "cerrada" ? { hasta: fechaISOEnAR() } : {}) })
      .eq("id", id)
      .select("id");
    if (error || (data ?? []).length === 0) return { ok: false, mensaje: FALLO };
    if (estado === "cerrada") await registrarAccionAdmin(admin.email, "track_ronda_cerrada", String(id), {});
    return { ok: true, mensaje: estado === "cerrada" ? "Ronda cerrada." : "Ronda reabierta." };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

/** Reparte los casos de un área (o todos) a una persona en una ronda activa; no repite lo ya asignado igual. */
export async function asignarCasos(
  admin: Admin,
  e: { rondaId: number; area: string; casoId: number | null; email: string | null; dispositivo: string },
): Promise<Resultado<{ cantidad: number }>> {
  if (!(await personasValidas(admin, e.email))) return sinPermiso("Elegí una persona del equipo.");
  const dispositivo = texto(e.dispositivo, 120);
  try {
    const cliente = await db();
    const r = await cliente.from("track_rondas").select("estado").eq("id", e.rondaId).maybeSingle();
    if (!r.data) return sinPermiso("La ronda ya no existe.");
    if ((r.data as { estado: string }).estado !== "activa") return sinPermiso("La ronda está cerrada.");
    let q = cliente.from("track_casos").select("id").eq("archivado", false).limit(2000);
    if (e.casoId !== null) q = q.eq("id", e.casoId);
    else if (e.area) q = q.eq("area", e.area);
    const { data: casos, error } = await q;
    if (error) return { ok: false, mensaje: FALLO };
    const ids = ((casos ?? []) as { id: number }[]).map((c) => c.id);
    if (ids.length === 0) return sinPermiso("No hay casos para asignar.");
    const ya = await cliente.from("track_asignaciones").select("caso_id, admin_email, dispositivo").eq("ronda_id", e.rondaId).limit(5000);
    const existentes = new Set(((ya.data ?? []) as { caso_id: number; admin_email: string | null; dispositivo: string }[]).map((a) => `${a.caso_id}|${a.admin_email}|${a.dispositivo}`));
    const nuevas = ids.filter((id) => !existentes.has(`${id}|${e.email}|${dispositivo}`)).map((caso_id) => ({ ronda_id: e.rondaId, caso_id, admin_email: e.email, dispositivo }));
    if (nuevas.length === 0) return sinPermiso("Esos casos ya estaban asignados a esa persona.");
    const ins = await cliente.from("track_asignaciones").insert(nuevas);
    if (ins.error) return { ok: false, mensaje: FALLO };
    return { ok: true, mensaje: `${nuevas.length} ${nuevas.length === 1 ? "caso asignado" : "casos asignados"}.`, cantidad: nuevas.length };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function quitarAsignacion(admin: Admin, id: number): Promise<Resultado> {
  void admin;
  try {
    const { error } = await (await db()).from("track_asignaciones").delete().eq("id", id);
    return error ? { ok: false, mensaje: FALLO } : { ok: true, mensaje: "Asignación quitada." };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

// --- Reportes --------------------------------------------------------------------------------------------------------

export async function crearReporte(admin: Admin, crudo: Record<string, unknown>): Promise<Resultado<{ reporteId: number }>> {
  const v = validarReporte(crudo, fechaISOEnAR());
  if (!v.ok) return v;
  try {
    const { data, error } = await (await db()).from("track_reportes").insert({ ...v.datos, creado_por: admin.email }).select("id").single();
    if (error || !data) return { ok: false, mensaje: FALLO };
    return { ok: true, mensaje: "Reporte guardado.", reporteId: (data as { id: number }).id };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function actualizarReporte(admin: Admin, id: number, crudo: Record<string, unknown>): Promise<Resultado> {
  void admin;
  const v = validarReporte(crudo, fechaISOEnAR());
  if (!v.ok) return v;
  try {
    const { data, error } = await (await db()).from("track_reportes").update(v.datos).eq("id", id).select("id");
    if (error) return { ok: false, mensaje: FALLO };
    return (data ?? []).length > 0 ? { ok: true, mensaje: "Reporte actualizado." } : sinPermiso("Ese reporte ya no existe.");
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

/** Abre un bug con los datos del reporte y los vincula. */
export async function crearBugDesdeReporte(admin: Admin, reporteId: number): Promise<Resultado<{ bugId: number; codigo: string }>> {
  try {
    const { data } = await (await db()).from("track_reportes").select("*").eq("id", reporteId).maybeSingle();
    const r = data as { reportante: string; paso: string; haciendo: string; dispositivo: string; version_app: string; enlace: string; severidad: string; canal: string; codigo: string; bug_id: number | null } | null;
    if (!r) return sinPermiso("Ese reporte ya no existe.");
    if (r.bug_id !== null) return sinPermiso("Ese reporte ya tiene un bug.");
    const v = validarBug({
      titulo: r.paso.split("\n")[0]?.slice(0, 90) || "Reporte de tester",
      pasos: r.haciendo,
      actual: r.paso,
      dispositivo: [r.dispositivo, r.version_app && `v${r.version_app}`].filter(Boolean).join(" · "),
      enlace: r.enlace,
      severidad: r.severidad,
      reportado_por: r.reportante,
      recibido_por_email: admin.email,
      notas: `Llegó por ${r.canal} (${r.codigo}).`,
    });
    if (!v.ok) return v;
    return insertarBug(admin, v.datos, { reporteId });
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

// --- Adjuntos --------------------------------------------------------------------------------------------------------

export type PadreAdjunto = { tipo: "bug" | "reporte" | "prueba"; id: number };
const COLUMNA: Record<PadreAdjunto["tipo"], string> = { bug: "bug_id", reporte: "reporte_id", prueba: "prueba_id" };
const TABLA: Record<PadreAdjunto["tipo"], string> = { bug: "track_bugs", reporte: "track_reportes", prueba: "track_pruebas" };
const MAX_ADJUNTOS_POR_PADRE = 20;

export function parsearPadre(tipo: unknown, id: unknown): PadreAdjunto | null {
  const n = entero(id);
  return n !== null && (tipo === "bug" || tipo === "reporte" || tipo === "prueba") ? { tipo, id: n } : null;
}

/** Paso 1: valida y devuelve una URL firmada de subida (el archivo va directo al bucket privado, sin pasar por el servidor). */
export async function prepararSubida(
  admin: Admin,
  e: { padre: PadreAdjunto | null; nombre: unknown; mime: unknown; bytes: unknown },
): Promise<Resultado<{ ruta: string; token: string }>> {
  void admin;
  if (!e.padre) return sinPermiso("No encontramos dónde adjuntar.");
  const a = validarAdjunto(e.mime, e.bytes);
  if (!a.ok) return a;
  try {
    const cliente = await db();
    const existe = await cliente.from(TABLA[e.padre.tipo]).select("id").eq("id", e.padre.id).maybeSingle();
    if (!existe.data) return sinPermiso("Eso ya no existe.");
    const { count } = await cliente.from("track_adjuntos").select("id", { count: "exact", head: true }).eq(COLUMNA[e.padre.tipo], e.padre.id);
    if ((count ?? 0) >= MAX_ADJUNTOS_POR_PADRE) return sinPermiso(`Ya hay ${MAX_ADJUNTOS_POR_PADRE} adjuntos.`);
    const ruta = `adjuntos/${randomUUID()}-${nombreSeguro(typeof e.nombre === "string" ? e.nombre : "")}`;
    const { data, error } = await cliente.storage.from(BUCKET_ADJUNTOS).createSignedUploadUrl(ruta);
    if (error || !data) return { ok: false, mensaje: "No pudimos preparar la subida. Revisá que la migración 063 esté aplicada." };
    return { ok: true, mensaje: "ok", ruta, token: data.token };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

/** Paso 2: con el archivo ya subido, registra la ficha. Si el archivo no existe o la ficha falla, no queda nada. */
export async function registrarAdjunto(
  admin: Admin,
  e: { padre: PadreAdjunto | null; ruta: unknown; nombre: unknown; mime: unknown; bytes: unknown },
): Promise<Resultado> {
  if (!e.padre) return sinPermiso("No encontramos dónde adjuntar.");
  if (!rutaAdjuntoValida(e.ruta)) return sinPermiso("La ruta del archivo no es válida.");
  const a = validarAdjunto(e.mime, e.bytes);
  if (!a.ok) return a;
  try {
    const cliente = await db();
    const bucket = cliente.storage.from(BUCKET_ADJUNTOS);
    const { count: yaRegistrado } = await cliente.from("track_adjuntos").select("id", { count: "exact", head: true }).eq("ruta", e.ruta);
    if ((yaRegistrado ?? 0) > 0) return sinPermiso("Ese archivo ya está registrado.");
    const { data: info } = await bucket.info(e.ruta);
    if (!info) return sinPermiso("El archivo no llegó. Probá de nuevo.");
    // Tamaño y tipo salen del objeto guardado, no de lo que dice el cliente (si el SDK no los trae, valen los validados).
    const real = validarAdjunto(info.contentType ?? a.datos.mime, info.size ?? a.datos.bytes);
    if (!real.ok) {
      await bucket.remove([e.ruta]);
      return real;
    }
    const { error } = await cliente.from("track_adjuntos").insert({
      [COLUMNA[e.padre.tipo]]: e.padre.id,
      ruta: e.ruta,
      nombre: texto(e.nombre, 255) || "archivo",
      mime: real.datos.mime,
      tamano_bytes: real.datos.bytes,
      subido_por: admin.email,
    });
    if (error) {
      // Nunca se borra el archivo si otra ficha ya lo usa (unicidad o carrera): solo si ninguna fila tiene esa ruta.
      if (error.code !== "23505") {
        const { count } = await cliente.from("track_adjuntos").select("id", { count: "exact", head: true }).eq("ruta", e.ruta);
        if (count === 0) await bucket.remove([e.ruta]);
      }
      return { ok: false, mensaje: FALLO };
    }
    return { ok: true, mensaje: "Adjunto subido." };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}

export async function borrarAdjunto(admin: Admin, id: number): Promise<Resultado> {
  void admin;
  try {
    const cliente = await db();
    const { data } = await cliente.from("track_adjuntos").select("ruta").eq("id", id).maybeSingle();
    const ruta = (data as { ruta: string } | null)?.ruta;
    if (!ruta) return sinPermiso("Ese adjunto ya no existe.");
    const { error: errorArchivo } = await cliente.storage.from(BUCKET_ADJUNTOS).remove([ruta]);
    if (errorArchivo) return { ok: false, mensaje: FALLO };
    const { error } = await cliente.from("track_adjuntos").delete().eq("id", id);
    return error ? { ok: false, mensaje: FALLO } : { ok: true, mensaje: "Adjunto borrado." };
  } catch {
    return { ok: false, mensaje: FALLO };
  }
}
