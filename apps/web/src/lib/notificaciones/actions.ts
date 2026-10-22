"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { borrarSuscripcion, guardarSuscripcion } from "./push";
import { listarFamilia } from "@/lib/familia/nucleo";
import {
  actualizarEsperaDePersona,
  actualizarPreferencias,
  cancelarPosposiciones,
  marcarLeido,
  marcarTodosLeidos,
  posponerDosis,
} from "./avisos";
import { CLAVES_BOOLEANAS, ESPERAS_CUIDADOR, MINUTOS_POSPONER_SERVIDOR, esHoraValida, type PreferenciasAvisos } from "./avisos-tipos";
import { POSPONER_OPCIONES } from "@/lib/modo-simple/tipos";

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

const POSPONER_PERMITIDOS: number[] = [...POSPONER_OPCIONES];

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

/** Lo que Configurar avisos puede cambiar de a una cosa por vez (toggles instantáneos). */
export type ParchePreferencias = Partial<
  Pick<PreferenciasAvisos, (typeof CLAVES_BOOLEANAS)[number] | "espera_cuidador_min" | "silencio_desde" | "silencio_hasta">
>;

const MENSAJE_PREFS = "No pudimos guardar tu cambio. Probá de nuevo.";

/**
 * Guarda UN cambio de preferencias (cada toggle guarda al instante). Valida
 * contra una lista blanca: solo claves conocidas, booleanos reales, espera
 * dentro de las opciones y el silencio siempre como par desde/hasta.
 */
export async function guardarPreferenciaAvisosAction(parche: ParchePreferencias): Promise<EstadoPush> {
  const usuario = await requireUser();
  if (!parche || typeof parche !== "object") return { status: "error", message: MENSAJE_PREFS };

  const limpio: ParchePreferencias = {};
  for (const [clave, valor] of Object.entries(parche)) {
    if ((CLAVES_BOOLEANAS as readonly string[]).includes(clave)) {
      if (typeof valor !== "boolean") return { status: "error", message: MENSAJE_PREFS };
      (limpio as Record<string, boolean>)[clave] = valor;
    } else if (clave === "espera_cuidador_min") {
      if (!ESPERAS_CUIDADOR.some((e) => e.min === valor)) return { status: "error", message: "La espera elegida no es válida." };
      limpio.espera_cuidador_min = valor as number;
    } else if (clave !== "silencio_desde" && clave !== "silencio_hasta") {
      return { status: "error", message: MENSAJE_PREFS };
    }
  }
  if ("silencio_desde" in parche || "silencio_hasta" in parche) {
    const desde = parche.silencio_desde ?? null;
    const hasta = parche.silencio_hasta ?? null;
    if ((desde === null) !== (hasta === null) || (desde !== null && (!esHoraValida(desde) || !esHoraValida(hasta)))) {
      return { status: "error", message: "El horario de silencio no es válido." };
    }
    limpio.silencio_desde = desde;
    limpio.silencio_hasta = hasta;
  }
  if (Object.keys(limpio).length === 0) return { status: "error", message: MENSAJE_PREFS };

  try {
    const supabase = await createClient();
    const r = await actualizarPreferencias(supabase, usuario.id, limpio);
    if (!r.ok) return { status: "error", message: MENSAJE_PREFS };
  } catch {
    return { status: "error", message: MENSAJE_PREFS };
  }
  revalidatePath("/app/avisos/configuracion");
  return { status: "success" };
}

/**
 * "Esperar antes de avisarte" del bloque de la persona: la espera es de la
 * PERSONA (la lee el cron), así que se escribe en las personas de las que soy
 * Admin (la RLS lo hace cumplir de todos modos).
 */
export async function guardarEsperaPersonasAction(minutos: number): Promise<EstadoPush> {
  await requireUser();
  if (!ESPERAS_CUIDADOR.some((e) => e.min === minutos)) return { status: "error", message: "La espera elegida no es válida." };
  try {
    const supabase = await createClient();
    const admin = (await listarFamilia(supabase)).filter((p) => p.rol === "editar");
    if (admin.length === 0) return { status: "error", message: "Necesitás ser Admin para cambiar la espera." };
    for (const p of admin) {
      const r = await actualizarEsperaDePersona(supabase, p.id, minutos);
      if (!r.ok) return { status: "error", message: MENSAJE_PREFS };
    }
  } catch {
    return { status: "error", message: MENSAJE_PREFS };
  }
  revalidatePath("/app/avisos/configuracion");
  return { status: "success" };
}

/**
 * "Más tarde · en N min" del modo simple (N = 15/30/60 según Configurar modo
 * simple): además de ocultarla, el cron vuelve a avisar cuando vence `hasta`.
 */
export async function posponerDosisAction(medicamentoIds: string[], minutos: number = MINUTOS_POSPONER_SERVIDOR): Promise<EstadoPush> {
  const usuario = await requireUser();
  if (!POSPONER_PERMITIDOS.includes(minutos)) return { status: "error", message: "El tiempo elegido no es válido." };
  if (!Array.isArray(medicamentoIds) || medicamentoIds.length === 0 || medicamentoIds.length > 20 || !medicamentoIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return { status: "error", message: "La dosis no es válida." };
  }
  try {
    const supabase = await createClient();
    const r = await posponerDosis(supabase, usuario.id, medicamentoIds, minutos);
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
