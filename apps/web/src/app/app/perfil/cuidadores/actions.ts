"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";

// Server Actions nunca lanzan — mismo criterio que rutina/actions.ts
// (`EstadoAccion`): cualquier error de la capa de datos se traduce acá a
// un mensaje legible, nunca se deja propagar el error crudo de Postgres.
export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function invitarCuidadorAction(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    return { status: "error", message: "Ingresá un email válido." };
  }

  try {
    await cuidadoresNucleo.invitar(supabase, usuario.id, email);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  revalidatePath("/app/perfil/cuidadores");
  return { status: "success" };
}

// Mismo criterio que eliminarMedicamentoAction (rutina/actions.ts): acción
// directa sin estado de formulario, invocada desde un botón dentro de la
// fila de cada vínculo.
export async function revocarCuidadorAction(vinculoId: string) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await cuidadoresNucleo.revocar(supabase, usuario.id, vinculoId);
  revalidatePath("/app/perfil/cuidadores");
}
