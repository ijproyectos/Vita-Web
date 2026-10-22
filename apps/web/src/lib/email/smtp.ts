import "server-only";

import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import nodemailer, { type Transporter } from "nodemailer";

// Envío transaccional por SMTP (hosting propio, Ferozo/DonWeb, SSL 465).
// Nunca lanza: devuelve un resultado tipado. Sin variables de entorno
// configuradas, degrada a "sin_configuracion" en vez de romper.
export type ResultadoEnvio = { ok: true } | { ok: false; motivo: "sin_configuracion" | "error_envio" };

type ConfigSmtp = { host: string; port: number; user: string; pass: string; from: string };

// Netlify guarda el valor de una env var tal cual se tipeó: si se cargó
// `"vita <hola@...>"` con comillas (como en un .env, donde la shell sí las
// saca), llegan literales y nodemailer arma un remitente inválido
// (`"vita <hola"@dominio>`) que el servidor rechaza. Se quitan acá.
function sinComillas(valor: string | undefined): string | undefined {
  const v = valor?.trim();
  if (!v) return v;
  const m = v.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2].trim() : v;
}

function leerConfig(): ConfigSmtp | null {
  const host = sinComillas(process.env.SMTP_HOST);
  const port = Number(sinComillas(process.env.SMTP_PORT) || "465");
  const user = sinComillas(process.env.SMTP_USER);
  const pass = sinComillas(process.env.SMTP_PASS);
  const from = sinComillas(process.env.SMTP_FROM) || user;
  if (!host || !user || !pass || !from || !Number.isFinite(port)) return null;
  return { host, port, user, pass, from };
}

let transporter: Transporter | null = null;
let configEnUso: ConfigSmtp | null = null;

function obtenerTransporter(): { transporter: Transporter; from: string } | null {
  const config = leerConfig();
  if (!config) return null;
  if (!transporter || configEnUso?.host !== config.host || configEnUso?.user !== config.user) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    configEnUso = config;
  }
  return { transporter, from: config.from };
}

export async function enviarEmail(args: {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  /** Reply-To (ej. el mail de quien reporta un problema). */
  responderA?: string;
  adjuntos?: { nombre: string; contenido: Buffer; tipo?: string }[];
}): Promise<ResultadoEnvio> {
  // Las cuentas creadas por código (sin Gmail) tienen un email placeholder
  // que no recibe correo: nunca se intenta enviar (evita rebotes que dañan
  // la reputación del remitente).
  if (esEmailDeCuentaPorCodigo(args.para)) return { ok: false, motivo: "sin_configuracion" };
  const t = obtenerTransporter();
  if (!t) return { ok: false, motivo: "sin_configuracion" };
  try {
    await t.transporter.sendMail({
      from: t.from,
      to: args.para,
      subject: args.asunto,
      html: args.html,
      text: args.texto,
      ...(args.responderA ? { replyTo: args.responderA } : {}),
      ...(args.adjuntos?.length
        ? { attachments: args.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.tipo })) }
        : {}),
    });
    return { ok: true };
  } catch (e) {
    // Solo el código/mensaje del error, nunca credenciales ni el destinatario.
    const detalle = e instanceof Error ? e.message : "error desconocido";
    console.error(`[email] fallo de envío SMTP: ${detalle}`);
    return { ok: false, motivo: "error_envio" };
  }
}

/** Diagnóstico: valida conexión + credenciales sin enviar nada. */
export async function verificarSmtp(): Promise<ResultadoEnvio> {
  const t = obtenerTransporter();
  if (!t) return { ok: false, motivo: "sin_configuracion" };
  try {
    await t.transporter.verify();
    return { ok: true };
  } catch (e) {
    console.error(`[email] verificación SMTP falló: ${e instanceof Error ? e.message : "error desconocido"}`);
    return { ok: false, motivo: "error_envio" };
  }
}
