"use server";

import { redirect } from "next/navigation";
import { evaluarAccesoAdmin } from "@/lib/admin/acceso";
import { limpiarCookieVerificacion, revocarVerificacion } from "@/lib/admin/verificacion";
import { createClient } from "@/lib/supabase/server";

// Cierre de sesión del panel: termina la sesión de Supabase de ESTE dispositivo y borra la cookie del segundo
// factor. No exige admin a propósito: cerrar sesión nunca debe fallar por falta de permisos. Nunca lanza (salvo el
// redirect, que es el mecanismo de Next).
async function cerrar(): Promise<void> {
  // Primero se revoca en el servidor (mientras la sesión todavía identifica al admin), después se cierra la sesión.
  try {
    const { decision } = await evaluarAccesoAdmin();
    if (decision.permitido) await revocarVerificacion(decision.email);
  } catch {
    // Sin Auth no hay a quién revocar: la cookie igual se borra y vence sola.
  }
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Si Auth no responde igual se borra la cookie y se sale del panel.
  }
  await limpiarCookieVerificacion();
}

export async function cerrarSesionAdminAction(): Promise<void> {
  await cerrar();
  redirect("/adminvita/ingresar");
}

export async function cerrarSesionPorInactividadAction(): Promise<void> {
  await cerrar();
  redirect("/adminvita/ingresar?motivo=inactividad");
}
