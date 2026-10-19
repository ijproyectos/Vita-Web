"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { borrarSuscripcion, guardarSuscripcion } from "./push";
import {
  cancelarPosposiciones,
  guardarPreferencias,
  marcarLeido,
  marcarTodosLeidos,
  posponerDosis,
} from "./avisos";
import { ESPERAS_CUIDADOR, esHoraValida, type PreferenciasAvisos } from "./avisos-tipos";

// Server Actions de suscripción push. Nunca lanzan (requireUser queda fuera
// del try porque redirige lanzando un error de control de Next).
export type EstadoPush = { status: "success" } | { status: "error"; message: string };

type EntradaSuscripcion = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

export async function guardarSuscripcionAction(entrada: EntradaSuscripcion): Promise<EstadoPush> {
  await requireUser();

  const endpoint = entrada?.endpoint;
  const p256dh = entrada?.keys?.p256dh;
  const auth = entrada?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !p256dh ||
    !auth
  ) {
    return { status: "error", message: "La suscripción no es válida." };
  }

  try {
    const supabase = await createClient();
    const r = await guardarSuscripcion(supabase, {
      endpoint,
      p256dh,
      auth,
      userAgent: typeof entrada.userAgent === "string" ? entrada.userAgent.slice(0, 300) : null,
    });
    if (!r.ok) return { status: "error", message: "No pudimos activar los avisos. Probá de nuevo." };
    return { status: "success" };
  } catch {
    return { status: "error", message: "No pudimos activar los avisos. Probá de nuevo." };
  }
}

export async function borrarSuscripcionAction(endpoint: string): Promise<EstadoPush> {
  const usuario = await requireUser();
  if (typeof endpoint !== "string" || !endpoint) {
    return { status: "error", message: "La suscripción no es válida." };
  }

  try {
    const supabase = await createClient();
    const r = await borrarSuscripcion(supabase, usuario.id, endpoint);
    if (!r.ok) return { status: "error", message: "No pudimos desactivar los avisos." };
    return { status: "success" };
  } catch {
    return { status: "error", message: "No pudimos desactivar los avisos." };
  }
}

// --- Avisos (centro de notificaciones, preferencias, posposiciones) -----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function marcarAvisoLeidoAction(avisoId: string): Promise<EstadoPush> {
  const usuario = await requireUser();
  if (typeof avisoId !== "string" || !UUID.test(avisoId)) {
    return { status: "error", message: "El aviso no es válido." };
  }
  try {
    const supabase = await createClient();
    const ok = await marcarLeido(supabase, usuario.id, avisoId);
    if (!ok) return { status: "error", message: "No pudimos marcar el aviso como leído." };
  } catch {
    return { status: "error", message: "No pudimos marcar el aviso como leído." };
  }
  revalidatePath("/app");
  revalidatePath("/app/avisos");
  return { status: "success" };
}

export async function marcarTodosLeidosAction(): Promise<EstadoPush> {
  const usuario = await requireUser();
  try {
    const supabase = await createClient();
    const ok = await marcarTodosLeidos(supabase, usuario.id);
    if (!ok) return { status: "error", message: "No pudimos marcar los avisos como leídos." };
  } catch {
    return { status: "error", message: "No pudimos marcar los avisos como leídos." };
  }
  revalidatePath("/app");
  revalidatePath("/app/avisos");
  return { status: "success" };
}

export async function guardarPreferenciasAvisosAction(entrada: PreferenciasAvisos): Promise<EstadoPush> {
  const usuario = await requireUser();

  const espera = entrada?.espera_cuidador_min;
  if (!ESPERAS_CUIDADOR.some((e) => e.min === espera)) {
    return { status: "error", message: "La espera elegida no es válida." };
  }
  const desde = entrada.silencio_desde;
  const hasta = entrada.silencio_hasta;
  const conSilencio = desde !== null && hasta !== null;
  if ((desde === null) !== (hasta === null) || (conSilencio && (!esHoraValida(desde) || !esHoraValida(hasta)))) {
    return { status: "error", message: "El horario de silencio no es válido." };
  }

  try {
    const supabase = await createClient();
    const r = await guardarPreferencias(supabase, usuario.id, {
      silencio_desde: conSilencio ? desde : null,
      silencio_hasta: conSilencio ? hasta : null,
      espera_cuidador_min: espera,
      recordatorio_dosis: Boolean(entrada.recordatorio_dosis),
      aviso_turnos: Boolean(entrada.aviso_turnos),
      stock_bajo: Boolean(entrada.stock_bajo),
    });
    if (!r.ok) return { status: "error", message: "No pudimos guardar tus preferencias. Probá de nuevo." };
  } catch {
    return { status: "error", message: "No pudimos guardar tus preferencias. Probá de nuevo." };
  }
  revalidatePath("/app/avisos/configuracion");
  return { status: "success" };
}

/** "Más tarde · en 15 min" del modo simple: además de ocultarla, el cron vuelve a avisar. */
export async function posponerDosisAction(medicamentoIds: string[]): Promise<EstadoPush> {
  const usuario = await requireUser();
  if (!Array.isArray(medicamentoIds) || medicamentoIds.length === 0 || medicamentoIds.length > 20 || !medicamentoIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return { status: "error", message: "La dosis no es válida." };
  }
  try {
    const supabase = await createClient();
    const r = await posponerDosis(supabase, usuario.id, medicamentoIds);
    if (!r.ok) return { status: "error", message: "No pudimos programar el aviso." };
  } catch {
    return { status: "error", message: "No pudimos programar el aviso." };
  }
  return { status: "success" };
}

/** "Verlas ahora": se anula el aviso de nuevo que había quedado programado. */
export async function cancelarPosposicionAction(medicamentoIds: string[]): Promise<EstadoPush> {
  const usuario = await requireUser();
  if (!Array.isArray(medicamentoIds) || medicamentoIds.length > 20 || !medicamentoIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return { status: "error", message: "La dosis no es válida." };
  }
  try {
    const supabase = await createClient();
    const ok = await cancelarPosposiciones(supabase, usuario.id, medicamentoIds);
    if (!ok) return { status: "error", message: "No pudimos anular el aviso." };
  } catch {
    return { status: "error", message: "No pudimos anular el aviso." };
  }
  return { status: "success" };
}
