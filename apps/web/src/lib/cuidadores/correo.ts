import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarEmail, type ResultadoEnvio } from "@/lib/email/smtp";
import { invitacionCuidador } from "@/lib/email/plantillas/invitacion-cuidador";
import { codigoVinculacion } from "@/lib/email/plantillas/codigo-vinculacion";
import { obtenerPerfil } from "@/lib/perfil/nucleo";
import type { VinculoCuidador } from "./tipos";

const NOMBRE_FALLBACK = "Un familiar";

async function nombreDe(supabase: SupabaseClient, usuarioId: string): Promise<string> {
  try {
    const perfil = await obtenerPerfil(supabase, usuarioId);
    return perfil?.nombre?.trim() || NOMBRE_FALLBACK;
  } catch {
    return NOMBRE_FALLBACK;
  }
}

/** Manda la invitación (dirección a) al email del vínculo. Nunca lanza. */
export async function enviarInvitacionPorMail(
  supabase: SupabaseClient,
  elderId: string,
  vinculo: Pick<VinculoCuidador, "email_invitado" | "token" | "expira_at">,
  origen: string,
  /** Si invita alguien que gestiona el perfil (no la propia persona), su id. */
  quienInvitaId?: string
): Promise<ResultadoEnvio> {
  const nombreElder = await nombreDe(supabase, elderId);
  const nombreQuienInvita = quienInvitaId && quienInvitaId !== elderId ? await nombreDe(supabase, quienInvitaId) : undefined;
  const msRestantes = new Date(vinculo.expira_at).getTime() - new Date().getTime();
  const diasVigencia = Math.max(1, Math.ceil(msRestantes / (24 * 60 * 60 * 1000)));
  const plantilla = invitacionCuidador({
    nombreElder,
    urlInvitacion: `${origen}/cuidar/invitacion/${vinculo.token}`,
    diasVigencia,
    origen,
    nombreQuienInvita,
  });
  return enviarEmail({ para: vinculo.email_invitado, ...plantilla });
}

/**
 * Manda el código de 6 dígitos (dirección b) a la persona cuidada. El link
 * lleva a /login con `next` apuntando a /onboarding/inicio?codigo=XXXXXX,
 * el mismo deep link del mensaje de WhatsApp (ahí el código ya llega pre-cargado).
 */
export async function enviarCodigoPorMail(
  supabase: SupabaseClient,
  cuidadorId: string,
  para: string,
  codigo: string,
  expiraAt: string,
  origen: string
): Promise<ResultadoEnvio> {
  const nombreCuidador = await nombreDe(supabase, cuidadorId);
  const msRestantes = new Date(expiraAt).getTime() - new Date().getTime();
  const minutosVigencia = Math.max(1, Math.round(msRestantes / 60000));
  const destino = `/onboarding/inicio?codigo=${codigo}`;
  const plantilla = codigoVinculacion({
    nombreCuidador,
    codigo,
    minutosVigencia,
    urlIngreso: `${origen}/login?next=${encodeURIComponent(destino)}`,
    origen,
  });
  return enviarEmail({ para, ...plantilla });
}
