import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Núcleo de Web Push (VAPID). Mismo criterio que el resto de
// lib/notificaciones: nunca lanza, devuelve conteos y quien llama decide.
type Cliente = SupabaseClient;

export type PayloadPush = {
  title: string;
  body: string;
  /** Ruta relativa a abrir al tocar la notificación (ej. "/cuidar/<id>"). */
  url: string;
  /** Agrupa/pisa notificaciones de la misma dosis en vez de apilarlas. */
  tag: string;
  /**
   * Botones de la notificación (sw.js los maneja en `notificationclick`).
   * Ids conocidos: "tomada", "posponer" (llaman a /api/avisos/accion),
   * "como-llegar" (abre `datos.mapsUrl`).
   */
  actions?: { action: string; title: string }[];
  /**
   * La notificación no se cierra sola hasta que la persona la toca. Es lo más
   * cercano a una alarma que permite una PWA (ver sw.js).
   */
  requireInteraction?: boolean;
  /** Vuelve a sonar/vibrar aunque reemplace una notificación con el mismo tag. */
  renotify?: boolean;
  /** Datos para el service worker (ej. `{ medicamentoId }`). */
  datos?: Record<string, string>;
};

export type ResultadoPush = {
  /** Suscripciones que tenía el usuario al momento de enviar. */
  total: number;
  enviados: number;
  fallidos: number;
  /** Suscripciones muertas (404/410) que se borraron. */
  eliminadas: number;
  /** true si faltan las variables VAPID: no se intentó enviar nada. */
  sinConfigurar?: boolean;
};

export type SuscripcionNavegador = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

let vapidConfigurado = false;

function configurarVapid(): boolean {
  if (vapidConfigurado) return true;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !subject) return false;
  try {
    webpush.setVapidDetails(subject, publica, privada);
    vapidConfigurado = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda (o reasigna) la suscripción del navegador al usuario autenticado.
 * Pasa por la RPC `registrar_push_suscripcion` (security definer, siempre
 * auth.uid()) porque un navegador compartido puede cambiar de cuenta y la
 * fila vieja es de otro usuario — bajo RLS un upsert directo no puede
 * reasignarla.
 */
export async function guardarSuscripcion(
  supabase: Cliente,
  suscripcion: SuscripcionNavegador
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("registrar_push_suscripcion", {
    p_endpoint: suscripcion.endpoint,
    p_p256dh: suscripcion.p256dh,
    p_auth: suscripcion.auth,
    p_user_agent: suscripcion.userAgent ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Borra la suscripción propia (RLS: solo puede borrar filas suyas). */
export async function borrarSuscripcion(
  supabase: Cliente,
  usuarioId: string,
  endpoint: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("push_suscripciones")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

type FilaSuscripcion = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Envía `payload` a todas las suscripciones de `usuarioId`. Con un cliente
 * de sesión solo ve las suyas (RLS); para notificar a OTRO usuario hay que
 * pasar el cliente admin — y eso solo se hace desde código de sistema
 * (cron) o desde `recordarDosisAlElder`, que valida el vínculo antes.
 * Nunca lanza. Una suscripción que responde 404/410 está muerta y se borra.
 */
export async function enviarPush(
  cliente: Cliente,
  usuarioId: string,
  payload: PayloadPush
): Promise<ResultadoPush> {
  const vacio: ResultadoPush = { total: 0, enviados: 0, fallidos: 0, eliminadas: 0 };

  if (!configurarVapid()) return { ...vacio, sinConfigurar: true };

  const { data, error } = await cliente
    .from("push_suscripciones")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", usuarioId);

  if (error || !data) return vacio;

  const suscripciones = data as FilaSuscripcion[];
  const cuerpo = JSON.stringify(payload);
  const resultado: ResultadoPush = { ...vacio, total: suscripciones.length };
  const muertas: string[] = [];
  const vivas: string[] = [];

  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          cuerpo,
          { TTL: 60 * 60 * 4, urgency: "high", timeout: 10_000 }
        );
        resultado.enviados++;
        vivas.push(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          muertas.push(s.id);
        } else {
          resultado.fallidos++;
        }
      }
    })
  );

  if (muertas.length > 0) {
    const { error: errorBorrado } = await cliente.from("push_suscripciones").delete().in("id", muertas);
    if (!errorBorrado) resultado.eliminadas = muertas.length;
  }
  if (vivas.length > 0) {
    // Best-effort: con un cliente de sesión de otro usuario la RLS lo ignora.
    await cliente
      .from("push_suscripciones")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", vivas);
  }

  return resultado;
}
