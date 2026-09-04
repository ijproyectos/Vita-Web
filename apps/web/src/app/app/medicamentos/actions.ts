"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import type { DiaSemana, MomentoDia } from "@/lib/medicamentos/tipos";

// Mismo criterio que NutrIA: las Server Actions nunca lanzan, devuelven un
// discriminated union — así ningún campo de un <form action={fn}> queda
// no controlado esperando una excepción que nunca llega.
export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function crearMedicamento(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const horaProgramada = String(formData.get("horaProgramada") ?? "").trim();
  const momentoDia = String(formData.get("momentoDia") ?? "") as MomentoDia;
  const dosis = String(formData.get("dosis") ?? "").trim();
  const condicion = String(formData.get("condicion") ?? "").trim();
  const diasRecurrentes = formData.getAll("diasRecurrentes") as DiaSemana[];

  if (!nombre || !horaProgramada || !momentoDia) {
    return { status: "error", message: "Nombre, hora y momento del día son obligatorios." };
  }

  try {
    await medicamentos.agregar(supabase, usuario.id, {
      nombre,
      horaProgramada,
      momentoDia,
      dosis: dosis || null,
      condicion: condicion || null,
      diasRecurrentes,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  revalidatePath("/app/medicamentos");
  return { status: "success" };
}

export async function marcarTomadoAction(medicamentoId: string, tomado: boolean) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await medicamentos.marcarTomado(supabase, usuario.id, medicamentoId, tomado);
  revalidatePath("/app/medicamentos");
}

export async function marcarTodosTomadosAction() {
  const usuario = await requireUser();
  const supabase = await createClient();
  await medicamentos.marcarTodosTomados(supabase, usuario.id);
  revalidatePath("/app/medicamentos");
}

export async function eliminarMedicamentoAction(medicamentoId: string) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await medicamentos.eliminarHorario(supabase, usuario.id, medicamentoId);
  revalidatePath("/app/medicamentos");
}
