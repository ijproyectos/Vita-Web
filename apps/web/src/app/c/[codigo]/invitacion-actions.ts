"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { reclamarInvitacion } from "@/lib/cuidadores/nucleo";
import { origenPublico } from "@/lib/email/origen";
import { COOKIE_PERFIL_ACTIVO, OPCIONES_COOKIE_PERFIL } from "@/lib/familia/perfil-activo";
import { abreEnLaPersona, mailCoincide } from "@/lib/invitaciones/logica";
import { avisarInvitacionAceptada, entrarConCodigoMail, invitacionParaAceptar, pedirCodigoMail, type ResultadoEntrar, type ResultadoPedir } from "@/lib/invitaciones/nucleo";

async function ip(): Promise<string> {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
}

export async function pedirCodigoMailAction(codigo: string, email: string): Promise<ResultadoPedir> {
  return pedirCodigoMail(codigo, email, await ip(), await origenPublico());
}

export async function entrarConCodigoMailAction(codigo: string, email: string, codigoMail: string): Promise<ResultadoEntrar> {
  const supabase = await createClient();
  return entrarConCodigoMail(supabase, codigo, email, codigoMail, await ip());
}

export type ResultadoAceptar = { status: "ok" } | { status: "error"; mensaje: string };

/** "Empezar": acepta con la sesión. Se llega acá solo con un toque, nunca al abrir el link. */
export async function aceptarInvitacionPorCodigoAction(codigo: string): Promise<ResultadoAceptar> {
  const usuario = await requireUser();
  const inv = await invitacionParaAceptar(codigo);
  if (!inv) return { status: "error", mensaje: "Esta invitación ya venció o ya fue usada." };
  if (!mailCoincide(inv.email, usuario.email)) return { status: "error", mensaje: "Esta invitación es para otro mail." };

  const supabase = await createClient();
  const resultado = await reclamarInvitacion(supabase, inv.token);
  if ("error" in resultado) return { status: "error", mensaje: "No pudimos aceptar la invitación. Probá de nuevo." };

  // Quien entra por invitación no pasa por el onboarding.
  const { data: perfil } = await supabase.from("perfiles").select("nombre, onboarding_completado_at").eq("id", usuario.id).maybeSingle();
  const yaTeniaPerfil = !!perfil?.onboarding_completado_at;
  if (!yaTeniaPerfil) {
    await supabase.from("perfiles").upsert(
      { id: usuario.id, nombre: perfil?.nombre?.trim() || inv.nombreInvitado, uso_app: "cuido", onboarding_completado_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  }

  if (abreEnLaPersona(inv.rol, yaTeniaPerfil)) {
    (await cookies()).set(COOKIE_PERFIL_ACTIVO, inv.personaId, OPCIONES_COOKIE_PERFIL);
  }

  const nombre = (perfil?.nombre?.trim() || inv.nombreInvitado || "Tu familiar").split(/\s+/)[0];
  await avisarInvitacionAceptada(inv, nombre);
  return { status: "ok" };
}
