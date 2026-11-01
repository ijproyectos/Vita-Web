import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "./acceso";
import { registrarAccionAdmin } from "./auditoria";
import { autorizarGestionAdmins, esDueno, normalizarEmailAdmin, parsearAdminEmails } from "./decision";

// Administradores del panel. Cada función recibe el `Admin` de `requireAdmin()` (prueba de sesión + segundo factor) y
// recién entonces crea el cliente `service_role`. Escribir exige ser DUEÑO (ADMIN_EMAILS), se verifica acá aunque la
// acción ya lo haya comprobado. Nunca lanza.

export type FilaAdministrador = { email: string; agregadoPor: string | null; desde: string | null; rol: "dueno" | "admin" };

export type ListaAdministradores = { duenos: FilaAdministrador[]; administradores: FilaAdministrador[]; baseDisponible: boolean };

export async function listarAdministradores(admin: Admin): Promise<ListaAdministradores> {
  void admin; // el tipo es la prueba de que ya pasó requireAdmin()
  const duenos = parsearAdminEmails(process.env.ADMIN_EMAILS).map<FilaAdministrador>((email) => ({ email, agregadoPor: null, desde: null, rol: "dueno" }));
  try {
    const { data, error } = await createAdminClient()
      .from("administradores")
      .select("email, agregado_por, created_at")
      .is("revocado_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error || !data) return { duenos, administradores: [], baseDisponible: false };
    const filas = (data as { email: string; agregado_por: string; created_at: string }[])
      // Un dueño que también figure en la tabla se muestra una sola vez, como dueño.
      .filter((f) => !duenos.some((d) => d.email === f.email))
      .map<FilaAdministrador>((f) => ({ email: f.email, agregadoPor: f.agregado_por, desde: f.created_at, rol: "admin" }));
    return { duenos, administradores: filas, baseDisponible: true };
  } catch {
    return { duenos, administradores: [], baseDisponible: false };
  }
}

export type ResultadoGestion = { ok: true; mensaje: string } | { ok: false; mensaje: string };

export async function agregarAdministrador(admin: Admin, emailCrudo: unknown): Promise<ResultadoGestion> {
  const permiso = autorizarGestionAdmins(admin.rol);
  if (!permiso.ok) return permiso;
  const email = normalizarEmailAdmin(emailCrudo);
  if (!email) return { ok: false, mensaje: "Ese email no es válido." };
  if (esDueno(email, parsearAdminEmails(process.env.ADMIN_EMAILS))) return { ok: false, mensaje: "Esa persona ya es dueña del panel." };
  try {
    const { data, error } = await createAdminClient().rpc("admin_agregar_administrador", { p_email: email, p_por: admin.email });
    if (error) return { ok: false, mensaje: "No pudimos agregar al administrador. Revisá que la migración 047 esté aplicada." };
    if (data === "ya_activo") return { ok: false, mensaje: "Esa persona ya es administradora." };
    if (data !== "ok") return { ok: false, mensaje: "Ese email no es válido." };
    await registrarAccionAdmin(admin.email, "admin_agregado", null, { email });
    return { ok: true, mensaje: `${email} ya puede entrar al panel (con su cuenta de Google y el código por email).` };
  } catch {
    return { ok: false, mensaje: "No pudimos agregar al administrador. Probá de nuevo." };
  }
}

export async function revocarAdministrador(admin: Admin, emailCrudo: unknown): Promise<ResultadoGestion> {
  const permiso = autorizarGestionAdmins(admin.rol);
  if (!permiso.ok) return permiso;
  const email = normalizarEmailAdmin(emailCrudo);
  if (!email) return { ok: false, mensaje: "Ese email no es válido." };
  if (esDueno(email, parsearAdminEmails(process.env.ADMIN_EMAILS))) return { ok: false, mensaje: "Los dueños del panel no se pueden quitar desde acá." };
  try {
    const { data, error } = await createAdminClient().rpc("admin_revocar_administrador", { p_email: email });
    if (error) return { ok: false, mensaje: "No pudimos quitar el acceso. Probá de nuevo." };
    if (data !== true) return { ok: false, mensaje: "Esa persona no es administradora." };
    await registrarAccionAdmin(admin.email, "admin_revocado", null, { email });
    return { ok: true, mensaje: `${email} ya no tiene acceso al panel y su sesión se cerró.` };
  } catch {
    return { ok: false, mensaje: "No pudimos quitar el acceso. Probá de nuevo." };
  }
}
