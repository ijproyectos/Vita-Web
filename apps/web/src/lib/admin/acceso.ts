import "server-only";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decidirAcceso, parsearAdminEmails, type DecisionAcceso } from "./decision";
import { COOKIE_ADMIN, leerSecretoSesion, verificarToken } from "./sesion";

export type Admin = { id: string; email: string };

export const RUTA_INGRESO_ADMIN = "/adminvita/ingresar";
export const RUTA_VERIFICACION_ADMIN = "/adminvita/verificar";

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
 * ¿La sesión de Supabase tiene además la cookie de segundo factor, firmada, vigente y atada a ESTE usuario y email?
 * Sin `ADMIN_SESSION_SECRET` configurado siempre es false (nadie puede completar la verificación).
 */
export async function tieneVerificacionVigente(usuario: Pick<User, "id">, email: string): Promise<boolean> {
  const secreto = leerSecretoSesion(process.env.ADMIN_SESSION_SECRET);
  if (!secreto) return false;
  try {
    const token = (await cookies()).get(COOKIE_ADMIN)?.value;
    return verificarToken(token, { secreto, userId: usuario.id, email, ahoraMs: Date.now() }).ok;
  } catch {
    return false;
  }
}

/**
 * Guarda del panel /adminvita. Se llama en CADA página, en CADA función de datos y en CADA Server Action del panel,
 * no solo en el layout (los layouts no se vuelven a ejecutar en una navegación del cliente ni protegen las acciones).
 *
 * Dos factores: (1) sesión de Google con un email de ADMIN_EMAILS, confirmado; (2) cookie firmada de verificación
 * por email. Sin (1) va a la pantalla de ingreso; con (1) pero sin (2) va a `/adminvita/verificar`. El deslizamiento
 * de los 30 minutos de inactividad lo hace el proxy (las Server Components no pueden escribir cookies). Los datos
 * nunca se leen antes de que esta guarda pase.
 */
export async function requireAdmin(): Promise<Admin> {
  const { usuario, decision } = await evaluarAccesoAdmin();
  if (!decision.permitido || !usuario) redirect(RUTA_INGRESO_ADMIN);
  if (!(await tieneVerificacionVigente(usuario, decision.email))) redirect(RUTA_VERIFICACION_ADMIN);
  return { id: usuario.id, email: decision.email };
}
