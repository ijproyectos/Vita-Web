"use server";

import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { borrarSuscripcion, guardarSuscripcion } from "./push";

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
