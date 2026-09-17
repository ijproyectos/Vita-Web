"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { reclamarInvitacion } from "@/lib/cuidadores/nucleo";
import type { MotivoReclamoRechazado } from "@/lib/cuidadores/tipos";

// Nunca deja escapar una excepción cruda de Postgres/RPC hacia la UI —
// `reclamarInvitacion` ya devuelve un `ResultadoReclamo` tipado (nunca
// lanza), pero acá se remapean los tres motivos conocidos a mensaje
// propio explícitamente en vez de reenviar `resultado.mensaje` tal cual:
// esa función también tiene un motivo `error_desconocido` que interpola
// el `error.message` crudo de Postgres/RPC (pensado para logs, no para
// esta pantalla) — este mapeo es la barrera que evita que ese texto
// llegue a un cuidador recién llegado.
const MENSAJE_POR_MOTIVO: Record<MotivoReclamoRechazado, string> = {
  invitacion_no_encontrada: "Esta invitación no existe, ya fue usada o fue revocada.",
  invitacion_expirada: "Esta invitación ya venció. Pedile a la persona que te invitó que te comparta una nueva.",
  invitacion_no_corresponde_a_esta_cuenta: "Esta invitación fue enviada a otra cuenta de Google. Iniciá sesión con esa cuenta.",
  error_desconocido: "No pudimos procesar la invitación. Probá de nuevo en unos minutos.",
};

export type EstadoAceptarInvitacion = { status: "idle" } | { status: "error"; mensaje: string };

export async function aceptarInvitacionAction(
  _prev: EstadoAceptarInvitacion,
  formData: FormData
): Promise<EstadoAceptarInvitacion> {
  await requireUser();

  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { status: "error", mensaje: "Invitación inválida." };
  }

  const supabase = await createClient();
  const resultado = await reclamarInvitacion(supabase, token);

  if ("error" in resultado) {
    return { status: "error", mensaje: MENSAJE_POR_MOTIVO[resultado.error] };
  }

  redirect("/cuidar");
}
