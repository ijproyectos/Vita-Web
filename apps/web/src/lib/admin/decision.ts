// Decisión pura de acceso al panel /adminvita (sin Next ni Supabase, para poder testearla).
// La lista sale de la variable de entorno ADMIN_EMAILS (separada por comas). Sin variable o vacía = nadie es admin.

export function parsearAdminEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const vistos = new Set<string>();
  for (const parte of raw.split(",")) {
    const email = parte.trim().toLowerCase();
    if (email) vistos.add(email);
  }
  return [...vistos];
}

export type UsuarioSesion = {
  email?: string | null;
  email_confirmed_at?: string | null;
  identities?: ReadonlyArray<{
    provider?: string | null;
    identity_data?: { email_verified?: boolean | null } | null;
  }> | null;
};

export type MotivoRechazo = "sin_sesion" | "lista_vacia" | "sin_email" | "email_sin_confirmar" | "fuera_de_lista";

/** `dueno` = email de ADMIN_EMAILS (permanente, otorga y revoca accesos); `admin` = fila activa en `administradores`. */
export type RolAdmin = "dueno" | "admin";

export type DecisionAcceso = { permitido: true; email: string; rol: RolAdmin } | { permitido: false; motivo: MotivoRechazo };

// El email cuenta como confirmado si Supabase lo marcó (`email_confirmed_at`) o si hay una identidad de Google
// con email verificado. Se usa SIEMPRE `user.email` (lo fija Auth), nunca `user_metadata`, que el cliente puede reescribir.
export function emailConfirmado(user: UsuarioSesion): boolean {
  if (user.email_confirmed_at) return true;
  return (user.identities ?? []).some((i) => i.provider === "google" && i.identity_data?.email_verified === true);
}

/**
 * `duenos` sale de ADMIN_EMAILS; `admins` son los emails con fila activa en `administradores` (el llamador solo los
 * consulta si el usuario no es dueño, y falla cerrado si no puede). Con ADMIN_EMAILS vacío nadie entra: es una
 * configuración rota y se prefiere cerrar el panel.
 */
export function decidirAcceso(
  user: UsuarioSesion | null | undefined,
  duenos: readonly string[],
  admins: readonly string[] = [],
): DecisionAcceso {
  if (!user) return { permitido: false, motivo: "sin_sesion" };
  if (duenos.length === 0) return { permitido: false, motivo: "lista_vacia" };
  const email = user.email?.trim().toLowerCase();
  if (!email) return { permitido: false, motivo: "sin_email" };
  if (!emailConfirmado(user)) return { permitido: false, motivo: "email_sin_confirmar" };
  if (duenos.includes(email)) return { permitido: true, email, rol: "dueno" };
  if (admins.includes(email)) return { permitido: true, email, rol: "admin" };
  return { permitido: false, motivo: "fuera_de_lista" };
}

/** ¿El email (ya normalizado) pertenece a un dueño? Los dueños no se pueden quitar ni suspender desde el panel. */
export function esDueno(email: string, duenos: readonly string[]): boolean {
  return duenos.includes(email.trim().toLowerCase());
}

export type ResultadoPermiso = { ok: true } | { ok: false; mensaje: string };

/** Solo los dueños otorgan o revocan accesos de administrador. */
export function autorizarGestionAdmins(rol: RolAdmin): ResultadoPermiso {
  return rol === "dueno" ? { ok: true } : { ok: false, mensaje: "Solo los dueños pueden agregar o quitar administradores." };
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Normaliza (trim + minúsculas) y valida el formato de un email; null si no sirve. */
export function normalizarEmailAdmin(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const email = crudo.trim().toLowerCase();
  return email.length <= 320 && EMAIL_VALIDO.test(email) ? email : null;
}
