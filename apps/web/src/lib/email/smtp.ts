import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

// Envío transaccional por SMTP (hosting propio, Ferozo/DonWeb, SSL 465).
// Nunca lanza: devuelve un resultado tipado. Sin variables de entorno
// configuradas, degrada a "sin_configuracion" en vez de romper.
export type ResultadoEnvio = { ok: true } | { ok: false; motivo: "sin_configuracion" | "error_envio" };

type ConfigSmtp = { host: string; port: number; user: string; pass: string; from: string };

function leerConfig(): ConfigSmtp | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;
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
}): Promise<ResultadoEnvio> {
  const t = obtenerTransporter();
  if (!t) return { ok: false, motivo: "sin_configuracion" };
  try {
    await t.transporter.sendMail({
      from: t.from,
      to: args.para,
      subject: args.asunto,
      html: args.html,
      text: args.texto,
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
