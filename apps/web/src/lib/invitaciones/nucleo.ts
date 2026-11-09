import "server-only";

import { createHmac, randomBytes, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirSesion, hashIp, registrarIntentoYVerificarBloqueo, secretoIp } from "@/lib/acceso-codigo/nucleo";
import { enviarEmail } from "@/lib/email/smtp";
import { codigoIngresoInvitacion } from "@/lib/email/plantillas/codigo-ingreso-invitacion";
import { entregarAviso } from "@/lib/notificaciones/avisos";
import { urlFichaPersona } from "@/lib/notificaciones/mensajes";
import type { RolVinculo } from "@/lib/familia/tipos";
import { MINUTOS_CODIGO_MAIL, esCodigoSeis, mailCoincide, textoInvitacionAceptada } from "./logica";

// Invitación de cuidador por código. Uso sancionado del admin client (ver
// lib/supabase/admin.ts): quien abre el link todavía no tiene sesión, y la RLS
// no puede validar el código. Se expone solo el primer nombre de las personas
// y el permiso. Aceptar la invitación usa siempre el cliente de SESIÓN.

type Cliente = SupabaseClient;

export type Invitacion = {
  vinculoId: string;
  token: string;
  email: string;
  personaId: string;
  persona: string;
  invitador: string;
  invitadorId: string;
  invitoLaPersona: boolean;
  nombreInvitado: string | null;
  rol: RolVinculo;
  esPerfilGestionado: boolean;
};

function primerNombre(n: string | null | undefined, fallback: string): string {
  return n?.trim().split(/\s+/)[0] || fallback;
}

async function leerInvitacion(admin: Cliente, codigo: string): Promise<Invitacion | null> {
  const { data } = await admin
    .from("vinculos_cuidador")
    .select("id, token, elder_id, email_invitado, rol, nombre_invitado, invitado_por")
    .eq("codigo", codigo)
    .eq("estado", "pendiente")
    .not("elder_id", "is", null)
    .gt("expira_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const personaId = data.elder_id as string;
  const invitadorId = (data.invitado_por as string | null) ?? personaId;
  const ids = [...new Set([personaId, invitadorId])];
  const [{ data: perfiles }, { data: cuenta }] = await Promise.all([
    admin.from("perfiles").select("id, nombre").in("id", ids),
    admin.auth.admin.getUserById(personaId),
  ]);
  const nombre = (id: string) => (perfiles ?? []).find((p) => p.id === id)?.nombre as string | null | undefined;
  return {
    vinculoId: data.id as string,
    token: data.token as string,
    email: data.email_invitado as string,
    personaId,
    persona: primerNombre(nombre(personaId), "tu familiar"),
    invitador: primerNombre(nombre(invitadorId), "Tu familiar"),
    invitadorId,
    invitoLaPersona: invitadorId === personaId,
    nombreInvitado: (data.nombre_invitado as string | null) ?? null,
    rol: data.rol === "ver" ? "ver" : "editar",
    esPerfilGestionado: (cuenta?.user?.app_metadata as { tipo?: string } | undefined)?.tipo === "perfil_gestionado",
  };
}

export type ResultadoVer = { estado: "ok"; invitacion: Invitacion } | { estado: "nada" | "bloqueado" };

/** Abrir el link no consume nada. Cuenta como intento: no sirve para probar códigos. Nunca lanza. */
export async function verInvitacion(codigo: string, ip: string): Promise<ResultadoVer> {
  try {
    const admin = createAdminClient();
    if (await registrarIntentoYVerificarBloqueo(admin, hashIp(ip))) return { estado: "bloqueado" };
    const invitacion = await leerInvitacion(admin, codigo);
    return invitacion ? { estado: "ok", invitacion } : { estado: "nada" };
  } catch {
    return { estado: "nada" };
  }
}

/** Link viejo: le da un código a esa invitación para seguir por el flujo nuevo. Sin la 054, null. */
export async function codigoDeToken(token: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("vinculos_cuidador")
      .select("id, codigo")
      .eq("token", token)
      .eq("estado", "pendiente")
      .not("elder_id", "is", null)
      .gt("expira_at", new Date().toISOString())
      .maybeSingle();
    if (!data) return null;
    if (data.codigo) return data.codigo as string;
    const { data: nuevo, error } = await admin.rpc("asignar_codigo_invitacion", { p_vinculo: data.id });
    return error || typeof nuevo !== "string" ? null : nuevo;
  } catch {
    return null;
  }
}

function hashCodigoMail(vinculoId: string, codigo: string): string {
  return createHmac("sha256", secretoIp()).update(`${vinculoId}:${codigo}`).digest("hex");
}

export type ResultadoPedir = { estado: "enviado" | "otro_mail" | "espera" | "tope" | "bloqueado" | "invalida" | "error" };

/** Manda un código a la casilla invitada, solo si el mail escrito es ese. Nunca lanza. */
export async function pedirCodigoMail(codigo: string, email: unknown, ip: string, origen: string): Promise<ResultadoPedir> {
  try {
    if (!esCodigoSeis(codigo)) return { estado: "invalida" };
    const admin = createAdminClient();
    if (await registrarIntentoYVerificarBloqueo(admin, hashIp(ip))) return { estado: "bloqueado" };
    const inv = await leerInvitacion(admin, codigo);
    if (!inv) return { estado: "invalida" };
    if (!mailCoincide(inv.email, email)) return { estado: "otro_mail" };

    const secreto = String(randomInt(100000, 1000000));
    const { data: guardado, error } = await admin.rpc("guardar_codigo_mail_invitacion", {
      p_vinculo: inv.vinculoId,
      p_hash: hashCodigoMail(inv.vinculoId, secreto),
      p_email: inv.email.toLowerCase().trim(),
    });
    if (error) return { estado: "error" };
    if (guardado === "espera" || guardado === "tope") return { estado: guardado };

    const envio = await enviarEmail({
      para: inv.email,
      ...codigoIngresoInvitacion({ codigo: secreto, persona: inv.persona, minutosVigencia: MINUTOS_CODIGO_MAIL, origen }),
    });
    return { estado: envio.ok ? "enviado" : "error" };
  } catch {
    return { estado: "error" };
  }
}

export type ResultadoEntrar = { estado: "ok" | "incorrecto" | "bloqueado" | "error" };

/**
 * Probó que la casilla es suya: abre sesión en ese mail, creando la cuenta si
 * no existe. Equivale a un link de "olvidé mi contraseña". No acepta la
 * invitación: eso lo hace la persona al tocar "Empezar". Nunca lanza.
 */
export async function entrarConCodigoMail(supabase: Cliente, codigo: string, email: unknown, codigoMail: unknown, ip: string): Promise<ResultadoEntrar> {
  try {
    if (!esCodigoSeis(codigo) || !esCodigoSeis(codigoMail)) return { estado: "incorrecto" };
    const admin = createAdminClient();
    if (await registrarIntentoYVerificarBloqueo(admin, hashIp(ip))) return { estado: "bloqueado" };
    const inv = await leerInvitacion(admin, codigo);
    if (!inv || !mailCoincide(inv.email, email)) return { estado: "incorrecto" };

    const hash = hashCodigoMail(inv.vinculoId, codigoMail);
    const { data: valido, error } = await admin.rpc("verificar_codigo_mail_invitacion", {
      p_vinculo: inv.vinculoId,
      p_hash: hash,
      p_email: inv.email.toLowerCase().trim(),
    });
    if (error) return { estado: "error" };
    if (valido !== true) return { estado: "incorrecto" };

    const { error: errorCrear } = await admin.auth.admin.createUser({
      email: inv.email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { full_name: inv.nombreInvitado ?? undefined },
    });
    // Ya tenía cuenta: se entra a esa.
    if (errorCrear && errorCrear.code !== "email_exists" && errorCrear.status !== 422) return { estado: "error" };

    if (!(await abrirSesion(admin, supabase, inv.email))) return { estado: "error" };

    // El código se consume recién con la sesión abierta, así un fallo al entrar
    // no obliga a pedir otro mail. Si otro pedido lo consumió antes, este no
    // conserva la sesión: sigue siendo de un solo uso.
    const { data: consumido, error: errorConsumir } = await admin.rpc("consumir_codigo_mail_invitacion", {
      p_vinculo: inv.vinculoId,
      p_hash: hash,
    });
    if (errorConsumir || consumido !== true) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return { estado: errorConsumir ? "error" : "incorrecto" };
    }
    return { estado: "ok" };
  } catch {
    return { estado: "error" };
  }
}

/** Datos para aceptar con la sesión ya abierta. La RPC de aceptar vuelve a validar el mail. */
export async function invitacionParaAceptar(codigo: string): Promise<Invitacion | null> {
  try {
    return esCodigoSeis(codigo) ? await leerInvitacion(createAdminClient(), codigo) : null;
  } catch {
    return null;
  }
}

/** Le avisa a quien invitó. Solo después de que la RPC con la sesión aceptó. Nunca lanza. */
export async function avisarInvitacionAceptada(inv: Invitacion, cuidador: string): Promise<void> {
  try {
    const { titulo, cuerpo } = textoInvitacionAceptada({ cuidador, persona: inv.persona, invitoLaPersona: inv.invitoLaPersona });
    const url = inv.invitoLaPersona ? "/app/familia" : urlFichaPersona(inv.personaId, "editar");
    await entregarAviso(
      createAdminClient(),
      inv.invitadorId,
      { tipo: "invitacion_aceptada", titulo, cuerpo, url, personaId: inv.invitoLaPersona ? undefined : inv.personaId, datos: { vinculoId: inv.vinculoId } },
      { title: titulo, body: cuerpo, url, tag: `invitacion-aceptada-${inv.vinculoId}` }
    );
  } catch {
    console.error("[invitaciones] no se pudo avisar la aceptación");
  }
}
