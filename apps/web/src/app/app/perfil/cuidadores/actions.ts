"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import { enviarInvitacionPorMail } from "@/lib/cuidadores/correo";
import { emailValido, origenPublico } from "@/lib/email/origen";
import { permitirEnvio } from "@/lib/email/limite";

// Server Actions nunca lanzan — mismo criterio que rutina/actions.ts
// (`EstadoAccion`): cualquier error de la capa de datos se traduce acá a
// un mensaje legible, nunca se deja propagar el error crudo de Postgres.
export type EstadoAccion =
  | { status: "idle" }
  | { status: "success"; emailEnviado: boolean; email: string }
  | { status: "error"; message: string };

export async function invitarCuidadorAction(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!emailValido(email)) {
    return { status: "error", message: "Ingresá un email válido." };
  }

  let vinculo;
  try {
    vinculo = await cuidadoresNucleo.invitar(supabase, usuario.id, email);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  // Si el mail falla, la invitación igual existe: el link se copia a mano.
  const envio = permitirEnvio(vinculo.id)
    ? await enviarInvitacionPorMail(supabase, usuario.id, vinculo, await origenPublico())
    : { ok: false as const };

  revalidatePath("/app/perfil/cuidadores");
  return { status: "success", emailEnviado: envio.ok, email };
}

export type EstadoReenvio = { status: "success" } | { status: "error"; message: string };

export async function reenviarInvitacionAction(vinculoId: string): Promise<EstadoReenvio> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const { vinculo, vencida } = await cuidadoresNucleo.obtenerInvitacionReenviable(supabase, usuario.id, vinculoId);
  if (!vinculo) {
    return {
      status: "error",
      message: vencida ? "La invitación venció. Creá una nueva." : "No encontramos esa invitación.",
    };
  }
  if (!permitirEnvio(vinculo.id)) {
    return { status: "error", message: "Ya mandamos varios mails. Probá más tarde o copiá el link." };
  }

  const envio = await enviarInvitacionPorMail(supabase, usuario.id, vinculo, await origenPublico());
  if (!envio.ok) {
    return { status: "error", message: "No pudimos mandar el mail — copiá el link y compartilo." };
  }
  return { status: "success" };
}

// Mismo criterio que eliminarMedicamentoAction (rutina/actions.ts): acción
// directa sin estado de formulario, invocada desde un botón dentro de la
// fila de cada vínculo.
export async function revocarCuidadorAction(vinculoId: string): Promise<EstadoReenvio> {
  const usuario = await requireUser();
  const supabase = await createClient();
  try {
    await cuidadoresNucleo.revocar(supabase, usuario.id, vinculoId);
  } catch {
    return { status: "error", message: "No se pudo revocar. Intentá de nuevo." };
  }
  revalidatePath("/app/perfil/cuidadores");
  return { status: "success" };
}
