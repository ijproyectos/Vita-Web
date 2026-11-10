"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { leerTurnoDelFormulario } from "@/lib/turnos/formulario";
import { MENSAJE_SOLO_LECTURA, rolSobre } from "@/lib/familia/perfil-activo";
import type { EstadoAccion } from "../rutina/actions";

// Editar / borrar un turno existente desde "Mis turnos": escribe sobre el
// DUEÑO del turno (no sobre el perfil activo) y exige rol "editar". La
// edición usa el mismo formulario que el alta (FormularioTurno).

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

export async function editarTurnoAction(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await requireUser();
  const turnoId = String(formData.get("turnoId") ?? "");
  const lectura = leerTurnoDelFormulario(formData);
  if (!lectura.ok) return { status: "error", message: lectura.message };
  try {
    const supabase = await createClient();
    const objetivo = await duenioEditable(supabase, turnoId);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await turnosNucleo.actualizar(supabase, objetivo.usuarioId, turnoId, lectura.datos);
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
