import "server-only";

import { cookies } from "next/headers";
import { origenPublico } from "@/lib/email/origen";
import { codigoAdmin } from "@/lib/email/plantillas/codigo-admin";
import { enviarEmail } from "@/lib/email/smtp";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluarAccesoAdmin } from "./acceso";
import {
  esOtpValido,
  esResultadoVerificacion,
  evaluarEnvio,
  generarOtp,
  hashOtp,
  mensajeEnvioLimitado,
  mensajeVerificacion,
  normalizarOtp,
  OTP_VENCE_MS,
} from "./otp";
import { COOKIE_ADMIN, crearToken, leerSecretoSesion, opcionesCookieAdmin, RUTA_COOKIE_ADMIN } from "./sesion";

export type RespuestaVerificacion = { status: "success"; mensaje: string } | { status: "error"; mensaje: string };

export const MENSAJE_SIN_SECRETO =
  "El segundo factor no está configurado (falta ADMIN_SESSION_SECRET, de al menos 32 caracteres). Nadie puede entrar al panel hasta configurarlo.";

const ERROR_GENERICO: RespuestaVerificacion = { status: "error", mensaje: "No pudimos completar el pedido. Probá de nuevo." };

/**
 * Envía el código de 6 dígitos al email de la sesión. Exige sesión de admin (Google + ADMIN_EMAILS), pero todavía
 * NO la cookie de verificación (es justamente lo que se está obteniendo). Usa `service_role` para las tablas del
 * segundo factor (RLS sin policies) con el usuario/email salidos de la sesión, nunca del cliente. Nunca lanza.
 */
export async function enviarCodigoVerificacion(): Promise<RespuestaVerificacion> {
  try {
    const secreto = leerSecretoSesion(process.env.ADMIN_SESSION_SECRET);
    if (!secreto) return { status: "error", mensaje: MENSAJE_SIN_SECRETO };
    const { usuario, decision } = await evaluarAccesoAdmin();
    if (!decision.permitido || !usuario) return { status: "error", mensaje: "Tu sesión no tiene acceso al panel." };
    const email = decision.email;

    const admin = createAdminClient();
    const ahora = Date.now();

    const { data: previos, error: errorPrevios } = await admin
      .from("admin_codigos_verificacion")
      .select("created_at")
      .eq("admin_email", email)
      .gte("created_at", new Date(ahora - 3_600_000).toISOString());
    if (errorPrevios) return ERROR_GENERICO;
    const limite = evaluarEnvio((previos ?? []).map((f) => Date.parse(String((f as { created_at: unknown }).created_at))), ahora);
    if (!limite.ok) return { status: "error", mensaje: mensajeEnvioLimitado(limite) };

    // Los códigos anteriores sin usar dejan de servir: vale solo el último.
    await admin
      .from("admin_codigos_verificacion")
      .update({ usado_at: new Date(ahora).toISOString() })
      .eq("admin_email", email)
      .is("usado_at", null);

    const codigo = generarOtp();
    const { data: fila, error: errorInsert } = await admin
      .from("admin_codigos_verificacion")
      .insert({
        usuario_id: usuario.id,
        admin_email: email,
        codigo_hash: hashOtp(codigo, email, secreto),
        vence_at: new Date(ahora + OTP_VENCE_MS).toISOString(),
      })
      .select("id")
      .single();
    if (errorInsert || !fila) return ERROR_GENERICO;

    const correo = codigoAdmin({ codigo, minutosVigencia: Math.round(OTP_VENCE_MS / 60_000), origen: await origenPublico() });
    const envio = await enviarEmail({ para: email, asunto: correo.asunto, html: correo.html, texto: correo.texto });
    if (!envio.ok) {
      // Un envío que falló no cuenta para el límite ni deja un código vivo que nadie recibió.
      await admin.from("admin_codigos_verificacion").delete().eq("id", (fila as { id: string }).id);
      return {
        status: "error",
        mensaje:
          envio.motivo === "sin_configuracion"
            ? "El envío de email no está configurado en el servidor."
            : "No pudimos enviar el email. Probá de nuevo en un momento.",
      };
    }
    return { status: "success", mensaje: "Te enviamos un código a tu email. Vence en 10 minutos." };
  } catch {
    return ERROR_GENERICO;
  }
}

/** Verifica el código y, si es correcto, deja la cookie firmada de verificación. Nunca lanza. */
export async function confirmarCodigoVerificacion(codigoCrudo: string): Promise<RespuestaVerificacion> {
  try {
    const secreto = leerSecretoSesion(process.env.ADMIN_SESSION_SECRET);
    if (!secreto) return { status: "error", mensaje: MENSAJE_SIN_SECRETO };
    const { usuario, decision } = await evaluarAccesoAdmin();
    if (!decision.permitido || !usuario) return { status: "error", mensaje: "Tu sesión no tiene acceso al panel." };

    const codigo = normalizarOtp(codigoCrudo.slice(0, 32));
    if (!esOtpValido(codigo)) return { status: "error", mensaje: "El código tiene 6 dígitos." };

    const { data, error } = await createAdminClient().rpc("verificar_codigo_admin", {
      p_email: decision.email,
      p_hash: hashOtp(codigo, decision.email, secreto),
    });
    if (error || !esResultadoVerificacion(data)) return ERROR_GENERICO;
    if (data !== "ok") return { status: "error", mensaje: mensajeVerificacion(data) };

    const token = crearToken({ userId: usuario.id, email: decision.email, ahoraMs: Date.now(), secreto });
    (await cookies()).set(COOKIE_ADMIN, token, opcionesCookieAdmin(process.env.NODE_ENV === "production"));
    return { status: "success", mensaje: "Verificado." };
  } catch {
    return ERROR_GENERICO;
  }
}

/** Borra la cookie de verificación (logout o inactividad). */
export async function limpiarCookieVerificacion(): Promise<void> {
  try {
    (await cookies()).set(COOKIE_ADMIN, "", { ...opcionesCookieAdmin(process.env.NODE_ENV === "production"), maxAge: 0, path: RUTA_COOKIE_ADMIN });
  } catch {
    // Sin contexto de cookies escribibles: la cookie vence sola.
  }
}
