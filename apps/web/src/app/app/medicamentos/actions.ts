"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import type { DatosActualizarGrupo } from "@/lib/medicamentos/tipos";
import { MENSAJE_SOLO_LECTURA, rolSobre } from "@/lib/familia/perfil-activo";
import type { EstadoAccion } from "../rutina/actions";

// Edición y borrado de un medicamento completo (todos sus horarios) desde
// "Mis medicamentos". Como las demás acciones sobre filas existentes, escribe
// sobre el DUEÑO de la fila (no sobre el perfil activo) y exige rol "editar".

async function duenioEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<{ ok: true; usuarioId: string } | { ok: false; message: string }> {
  if (ids.length === 0) return { ok: false, message: "No encontramos ese medicamento." };
  const duenio = await medicamentos.duenioDeMedicamento(supabase, ids[0]);
  if (!duenio) return { ok: false, message: "No encontramos ese medicamento." };
  if ((await rolSobre(duenio)) !== "editar") return { ok: false, message: MENSAJE_SOLO_LECTURA };
  return { ok: true, usuarioId: duenio };
}

function revalidar() {
  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/medicamentos");
  revalidatePath("/app/pastillas");
  revalidatePath("/app/modo-simple");
}

export async function guardarMedicamentoAction(ids: string[], datos: DatosActualizarGrupo): Promise<EstadoAccion> {
  await requireUser();
  try {
    const supabase = await createClient();
    const objetivo = await duenioEditable(supabase, ids);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await medicamentos.actualizarGrupo(supabase, objetivo.usuarioId, ids, datos);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar el medicamento." };
  }
  revalidar();
  return { status: "success" };
}

export async function eliminarMedicamentoGrupoAction(ids: string[]): Promise<EstadoAccion> {
  await requireUser();
  try {
    const supabase = await createClient();
    const objetivo = await duenioEditable(supabase, ids);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await medicamentos.eliminarGrupo(supabase, objetivo.usuarioId, ids);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo eliminar el medicamento." };
  }
  revalidar();
  return { status: "success" };
}
