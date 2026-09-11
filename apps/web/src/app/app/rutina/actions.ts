"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import type { ConComida, MomentoDia } from "@/lib/medicamentos/tipos";

// Compartidas entre Home y Rutina — ambas pantallas muestran y togglean
// los mismos medicamentos/turnos de hoy.

export async function marcarTomadoAction(medicamentoId: string, tomado: boolean) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await medicamentos.marcarTomado(supabase, usuario.id, medicamentoId, tomado);
  revalidatePath("/app");
  revalidatePath("/app/rutina");
}

// Marcar todos los pendientes de hoy de una — el diálogo/botón viejo
// (marcar-todos-button.tsx) se había perdido al migrar de Medicamentos a
// Rutina; el hallazgo del review lo marcó como regresión real, no un
// recorte de alcance deliberado.
export async function marcarTodosTomadosAction() {
  const usuario = await requireUser();
  const supabase = await createClient();
  await medicamentos.marcarTodosTomados(supabase, usuario.id);
  revalidatePath("/app");
  revalidatePath("/app/rutina");
}

// Mismo motivo — no había ningún camino para borrar un medicamento
// cargado por error desde que se retiró el módulo viejo de Medicamentos.
export async function eliminarMedicamentoAction(medicamentoId: string) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await medicamentos.eliminarHorario(supabase, usuario.id, medicamentoId);
  revalidatePath("/app");
  revalidatePath("/app/rutina");
}

export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function crearMedicamentoAction(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const dosis = String(formData.get("dosis") ?? "").trim();
  const unidad = String(formData.get("unidad") ?? "mg");
  const frecuencia = String(formData.get("frecuencia") ?? "");
  const MOMENTOS_VALIDOS: MomentoDia[] = ["mañana", "mediodia", "tarde", "noche"];
  // Validado en runtime, no solo casteado — el form ya solo manda estos
  // valores, pero un FormData siempre es texto libre en el borde del
  // sistema; antes esto solo fallaba tarde, en el constraint de la DB.
  const momentos = (formData.getAll("momentos") as string[]).filter((m): m is MomentoDia =>
    MOMENTOS_VALIDOS.includes(m as MomentoDia)
  );
  const conComida = String(formData.get("conComida") ?? "no-importa") as ConComida;
  const duracion = String(formData.get("duracion") ?? "");
  const notas = String(formData.get("notas") ?? "").trim();

  if (!nombre || !dosis || momentos.length === 0) {
    return { status: "error", message: "Nombre, dosis y al menos un momento del día son obligatorios." };
  }

  try {
    await medicamentos.agregarMultiMomento(supabase, usuario.id, {
      nombre,
      dosis,
      unidad,
      momentos,
      frecuencia: frecuencia || null,
      conComida,
      duracion: duracion || null,
      notas: notas || null,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  return { status: "success" };
}

export async function crearTurnoAction(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const especialidad = String(formData.get("especialidad") ?? "").trim();
  const profesional = String(formData.get("profesional") ?? "").trim();
  const lugar = String(formData.get("lugar") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  const hora = String(formData.get("hora") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const recordatorio = String(formData.get("recordatorio") ?? "");
  const acompanado = formData.get("acompanado") === "on";
  const notas = String(formData.get("notas") ?? "").trim();

  if (!especialidad || !fecha || !hora) {
    return { status: "error", message: "Especialidad, fecha y hora son obligatorios." };
  }

  try {
    await turnosNucleo.agregar(supabase, usuario.id, {
      especialidad,
      profesional: profesional || null,
      lugar: lugar || null,
      fecha,
      hora,
      motivo: motivo || null,
      recordatorio: recordatorio || null,
      acompanado,
      notas: notas || null,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  return { status: "success" };
}
