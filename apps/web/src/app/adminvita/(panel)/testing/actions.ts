"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/acceso";
import {
  actualizarBug,
  actualizarReporte,
  asignarCasos,
  borrarAdjunto,
  borrarComentario,
  cambiarEstadoRonda,
  comentarBug,
  crearBug,
  crearBugDesdePrueba,
  crearBugDesdeReporte,
  crearReporte,
  crearRonda,
  parsearPadre,
  prepararSubida,
  quitarAsignacion,
  registrarAdjunto,
  registrarPrueba,
  type Resultado,
} from "@/lib/admin/testing/escritura";
import { entero, enteroOpcional } from "@/lib/admin/testing/logica";

// Las Server Actions del panel llaman a `requireAdmin()` ellas mismas: ni el layout ni la página las protegen. Nunca lanzan
// (el redirect de requireAdmin es el mecanismo de Next para mandar a ingresar/verificar).

export type EstadoForm = { status: "idle" } | { status: "error"; mensaje: string } | { status: "success"; mensaje: string; id?: number };

function aEstado(r: Resultado<{ bugId?: number; rondaId?: number; reporteId?: number; pruebaId?: number }>): EstadoForm {
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  const id = "bugId" in r ? r.bugId : "rondaId" in r ? r.rondaId : "reporteId" in r ? r.reporteId : "pruebaId" in r ? r.pruebaId : undefined;
  return { status: "success", mensaje: r.mensaje, id };
}

function refrescar() {
  revalidatePath("/adminvita/testing", "layout");
}

function campos(f: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

const ID_INVALIDO: EstadoForm = { status: "error", mensaje: "El identificador no es válido." };

// --- Pruebas ---------------------------------------------------------------------------------------------------------

export async function registrarPruebaAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const r = await registrarPrueba(admin, {
    casoId: f.get("casoId"),
    asignacionId: f.get("asignacionId"),
    estado: f.get("estado"),
    resultado: f.get("resultado"),
    dispositivo: f.get("dispositivo"),
  });
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function crearBugDesdePruebaAction(pruebaId: number): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(pruebaId);
  if (id === null) return ID_INVALIDO;
  const r = await crearBugDesdePrueba(admin, id);
  if (r.ok) refrescar();
  return aEstado(r);
}

// --- Bugs ------------------------------------------------------------------------------------------------------------

export async function crearBugAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const reporteId = enteroOpcional(f.get("reporteId"));
  const r = await crearBug(admin, campos(f), reporteId ?? undefined);
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function actualizarBugAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(f.get("id"));
  if (id === null) return ID_INVALIDO;
  const r = await actualizarBug(admin, id, f.get("estado"), campos(f));
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function comentarBugAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(f.get("id"));
  if (id === null) return ID_INVALIDO;
  const r = await comentarBug(admin, id, f.get("cuerpo"));
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function borrarComentarioAction(eventoId: number): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(eventoId);
  if (id === null) return ID_INVALIDO;
  const r = await borrarComentario(admin, id);
  if (r.ok) refrescar();
  return aEstado(r);
}

// --- Rondas ----------------------------------------------------------------------------------------------------------

export async function crearRondaAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const r = await crearRonda(admin, campos(f));
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function cambiarEstadoRondaAction(rondaId: number, estado: "activa" | "cerrada"): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(rondaId);
  if (id === null || (estado !== "activa" && estado !== "cerrada")) return ID_INVALIDO;
  const r = await cambiarEstadoRonda(admin, id, estado);
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function asignarCasosAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const rondaId = entero(f.get("rondaId"));
  if (rondaId === null) return ID_INVALIDO;
  const casoId = enteroOpcional(f.get("casoId"));
  if (casoId === undefined) return ID_INVALIDO;
  const email = typeof f.get("email") === "string" ? String(f.get("email")).trim().toLowerCase() : "";
  const r = await asignarCasos(admin, {
    rondaId,
    area: typeof f.get("area") === "string" ? String(f.get("area")).slice(0, 60) : "",
    casoId,
    email: email === "" ? null : email,
    dispositivo: typeof f.get("dispositivo") === "string" ? String(f.get("dispositivo")) : "",
  });
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function quitarAsignacionAction(asignacionId: number): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(asignacionId);
  if (id === null) return ID_INVALIDO;
  const r = await quitarAsignacion(admin, id);
  if (r.ok) refrescar();
  return aEstado(r);
}

// --- Reportes --------------------------------------------------------------------------------------------------------

export async function crearReporteAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const r = await crearReporte(admin, campos(f));
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function actualizarReporteAction(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(f.get("id"));
  if (id === null) return ID_INVALIDO;
  const r = await actualizarReporte(admin, id, campos(f));
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function crearBugDesdeReporteAction(reporteId: number): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(reporteId);
  if (id === null) return ID_INVALIDO;
  const r = await crearBugDesdeReporte(admin, id);
  if (r.ok) refrescar();
  return aEstado(r);
}

// --- Adjuntos --------------------------------------------------------------------------------------------------------

export type EstadoSubida = { status: "error"; mensaje: string } | { status: "success"; ruta: string; token: string };

export async function prepararSubidaAction(tipo: string, id: number, nombre: string, mime: string, bytes: number): Promise<EstadoSubida> {
  const admin = await requireAdmin();
  const r = await prepararSubida(admin, { padre: parsearPadre(tipo, id), nombre, mime, bytes });
  return r.ok ? { status: "success", ruta: r.ruta, token: r.token } : { status: "error", mensaje: r.mensaje };
}

export async function registrarAdjuntoAction(tipo: string, id: number, ruta: string, nombre: string, mime: string, bytes: number): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const r = await registrarAdjunto(admin, { padre: parsearPadre(tipo, id), ruta, nombre, mime, bytes });
  if (r.ok) refrescar();
  return aEstado(r);
}

export async function borrarAdjuntoAction(adjuntoId: number): Promise<EstadoForm> {
  const admin = await requireAdmin();
  const id = entero(adjuntoId);
  if (id === null) return ID_INVALIDO;
  const r = await borrarAdjunto(admin, id);
  if (r.ok) refrescar();
  return aEstado(r);
}
