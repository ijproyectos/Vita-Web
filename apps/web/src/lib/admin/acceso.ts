import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decidirAcceso, parsearAdminEmails, type DecisionAcceso } from "./decision";

export type Admin = { id: string; email: string };

export const RUTA_INGRESO_ADMIN = "/adminvita/ingresar";

/** Usuario de la sesión (cliente de SESIÓN + `getUser()`, que valida el JWT contra Auth) y la decisión de acceso. */
export async function evaluarAccesoAdmin(): Promise<{ usuario: User | null; decision: DecisionAcceso }> {
  const lista = parsearAdminEmails(process.env.ADMIN_EMAILS);
  let usuario: User | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    usuario = error ? null : data.user;
  } catch {
    usuario = null;
  }
  return { usuario, decision: decidirAcceso(usuario, lista) };
}

/**
 * Guarda del panel /adminvita. Se llama en CADA página y en CADA función de datos del panel, no solo en el layout
 * (los layouts no se vuelven a ejecutar en una navegación del cliente).
 *
 * Quien no es admin (sin sesión, email sin confirmar, fuera de ADMIN_EMAILS, lista vacía) va a la pantalla de ingreso,
 * que le ofrece entrar con Google o le explica por qué su cuenta no tiene acceso. Los datos nunca se leen antes de
 * que esta guarda pase.
 */
export async function requireAdmin(): Promise<Admin> {
  const { usuario, decision } = await evaluarAccesoAdmin();
  if (!decision.permitido || !usuario) redirect(RUTA_INGRESO_ADMIN);
  return { id: usuario.id, email: decision.email };
}
