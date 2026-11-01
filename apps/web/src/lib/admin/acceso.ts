import "server-only";

import type { User } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decidirAcceso, parsearAdminEmails } from "./decision";

export type Admin = { id: string; email: string };

/**
 * Guarda del panel /adminvita. Se llama en CADA página y en CADA función de datos del panel, no solo en el layout
 * (los layouts no se vuelven a ejecutar en una navegación del cliente).
 *
 * Usa el cliente de SESIÓN y `getUser()` (valida el JWT contra Auth; `getSession()` no lo hace). Cualquiera que no
 * sea admin (anónimo, email sin confirmar, fuera de ADMIN_EMAILS, lista vacía) recibe un 404 idéntico al de una ruta
 * inexistente: el panel no revela que existe.
 */
export async function requireAdmin(): Promise<Admin> {
  const lista = parsearAdminEmails(process.env.ADMIN_EMAILS);
  if (lista.length === 0) notFound();

  let usuario: User | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    usuario = error ? null : data.user;
  } catch {
    usuario = null;
  }

  const decision = decidirAcceso(usuario, lista);
  if (!decision.permitido || !usuario) notFound();
  return { id: usuario.id, email: decision.email };
}
