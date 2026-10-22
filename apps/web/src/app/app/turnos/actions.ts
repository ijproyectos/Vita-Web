"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { validarTelefono } from "@/lib/turnos/tipos";
import { MENSAJE_SOLO_LECTURA, rolSobre } from "@/lib/familia/perfil-activo";
import type { EstadoAccion } from "../rutina/actions";

// Editar / borrar un turno existente desde "Mis turnos": escribe sobre el
// DUEÑO del turno (no sobre el perfil activo) y exige rol "editar".

export type DatosEdicionTurno = {
  especialidad: string;
  profesional: string;
  fecha: string;
  hora: string;
  lugar: string;
  /** undefined = la migración 023 no está aplicada: no se toca. */
  direccion?: string;
  /** undefined = la migración 023 no está aplicada: no se toca. */
  telefono?: string;
  notas: string;
};

async function duenioEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  turnoId: string
): Promise<{ ok: true; usuarioId: string } | { ok: false; message: string }> {
  const duenio = await turnosNucleo.duenioDeTurno(supabase, turnoId);
  if (!duenio) return { ok: false, message: "No encontramos ese turno." };
  if ((await rolSobre(duenio)) !== "editar") return { ok: false, message: MENSAJE_SOLO_LECTURA };
  return { ok: true, usuarioId: duenio };
}

function revalidar() {
  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/turnos");
}

export async function guardarTurnoAction(turnoId: string, datos: DatosEdicionTurno): Promise<EstadoAccion> {
  await requireUser();
  const especialidad = datos.especialidad.trim();
  if (!especialidad || !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) || !/^\d{2}:\d{2}$/.test(datos.hora)) {
    return { status: "error", message: "Especialidad, día y hora son obligatorios." };
  }
  const tel = datos.telefono !== undefined ? validarTelefono(datos.telefono) : null;
  if (tel && !tel.ok) return { status: "error", message: tel.message };
  try {
    const supabase = await createClient();
    const objetivo = await duenioEditable(supabase, turnoId);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await turnosNucleo.actualizar(supabase, objetivo.usuarioId, turnoId, {
      especialidad,
      profesional: datos.profesional.trim() || null,
      fecha: datos.fecha,
      hora: datos.hora,
      lugar: datos.lugar.trim() || null,
      notas: datos.notas.trim() || null,
      ...(datos.direccion !== undefined ? { direccion: datos.direccion.trim() || null } : {}),
      ...(tel && tel.ok ? { telefono: tel.valor } : {}),
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar el turno." };
  }
  revalidar();
  return { status: "success" };
}

export async function eliminarTurnoAction(turnoId: string): Promise<EstadoAccion> {
  await requireUser();
  try {
    const supabase = await createClient();
    const objetivo = await duenioEditable(supabase, turnoId);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await turnosNucleo.eliminar(supabase, objetivo.usuarioId, turnoId);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo eliminar el turno." };
  }
  revalidar();
  return { status: "success" };
}
