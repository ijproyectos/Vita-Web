import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClientConDispositivo } from "@/lib/supabase/dispositivo";
import { decidirSuspensionApp, leerMiSuspension, type SuspensionActiva } from "./logica";

export const RUTA_SUSPENDIDA = "/suspendida";

/**
 * Suspensión activa de la sesión (RPC `mi_suspension`, una consulta indexada), una sola vez por request. Con el
 * cliente de SESIÓN: la función solo devuelve filas del propio `auth.uid()`. Nunca lanza.
 */
export const consultarSuspension = cache(async (): Promise<{ suspension: SuspensionActiva | null; fallo: boolean }> => {
  try {
    const supabase = await createClientConDispositivo();
    const { data, error } = await supabase.rpc("mi_suspension");
    if (error) return { suspension: null, fallo: true };
    return { suspension: leerMiSuspension(data), fallo: false };
  } catch {
    return { suspension: null, fallo: true };
  }
});

/** Para layouts y páginas: una cuenta suspendida va a `/suspendida` (fuera de /app y /cuidar). */
export async function requireNoSuspendida(): Promise<void> {
  const d = decidirSuspensionApp(await consultarSuspension());
  if (d.accion === "bloquear") redirect(RUTA_SUSPENDIDA);
}

export const MENSAJE_CUENTA_SUSPENDIDA = "Tu cuenta está suspendida.";

/** ¿La sesión está suspendida? (falla abierto). Para Server Actions que devuelven `{ status: "error" }` en vez de redirigir. */
export async function estaSuspendida(): Promise<boolean> {
  return decidirSuspensionApp(await consultarSuspension()).accion === "bloquear";
}

/** Para rutas de API de una sesión ya validada: 403 `{ error: "cuenta_suspendida" }` o null si puede seguir. */
export async function respuestaSiSuspendida(): Promise<NextResponse | null> {
  const d = decidirSuspensionApp(await consultarSuspension());
  if (d.accion === "seguir") return null;
  return NextResponse.json({ error: "cuenta_suspendida" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
