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

export type DecisionAcceso = { permitido: true; email: string } | { permitido: false; motivo: MotivoRechazo };

// El email cuenta como confirmado si Supabase lo marcó (`email_confirmed_at`) o si hay una identidad de Google
// con email verificado. Se usa SIEMPRE `user.email` (lo fija Auth), nunca `user_metadata`, que el cliente puede reescribir.
export function emailConfirmado(user: UsuarioSesion): boolean {
  if (user.email_confirmed_at) return true;
  return (user.identities ?? []).some((i) => i.provider === "google" && i.identity_data?.email_verified === true);
}

export function decidirAcceso(user: UsuarioSesion | null | undefined, lista: readonly string[]): DecisionAcceso {
  if (!user) return { permitido: false, motivo: "sin_sesion" };
  if (lista.length === 0) return { permitido: false, motivo: "lista_vacia" };
  const email = user.email?.trim().toLowerCase();
  if (!email) return { permitido: false, motivo: "sin_email" };
  if (!emailConfirmado(user)) return { permitido: false, motivo: "email_sin_confirmar" };
  if (!lista.includes(email)) return { permitido: false, motivo: "fuera_de_lista" };
  return { permitido: true, email };
}
