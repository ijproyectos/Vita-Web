import { NextResponse } from "next/server";
import {
  esIdSeguro,
  leerNotificacion,
  MAX_BYTES_WEBHOOK,
  topicSoportado,
  verificarFirmaWebhook,
} from "@/lib/vita-plus/logica";
import { procesarNotificacionVitaPlus } from "@/lib/vita-plus/nucleo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responder(status: number, cuerpo: Record<string, unknown> = {}) {
  return NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Notificaciones de Mercado Pago para vita+ (aplicación propia de vita). Ruta PÚBLICA: no hay sesión; la
 * autenticación es la firma `x-signature` (HMAC-SHA256 con MP_WEBHOOK_SECRET), que se valida ANTES de cualquier
 * otro trabajo. El cuerpo nunca se confía: solo nombra qué recurso volver a pedir a Mercado Pago con nuestro
 * token. Respuestas: 401 firma mala, 200 manejado o ignorado, 503 transitorio (Mercado Pago reintenta).
 * Usa el cliente admin (uso sancionado, ver lib/supabase/admin.ts).
 */
export async function POST(request: Request) {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secreto || !process.env.MP_ACCESS_TOKEN?.trim()) {
    console.error("vita+ webhook: falta configuración");
    return responder(500, { error: "server_misconfigured" });
  }

  const largo = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(largo) && largo > MAX_BYTES_WEBHOOK) return responder(413, { error: "payload_too_large" });
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES_WEBHOOK) return responder(413, { error: "payload_too_large" });

  let cuerpo: unknown = null;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    cuerpo = null;
  }
  const notificacion = leerNotificacion(cuerpo);
  const url = new URL(request.url);
  const idQuery = url.searchParams.get("data.id");

  // 1. Autenticar: nada más pasa antes de esto.
  const firma = verificarFirmaWebhook({
    secreto,
    cabecera: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataIds: [notificacion.dataId, idQuery],
    ahoraMs: new Date().getTime(),
  });
  if (!firma.ok) {
    console.error("vita+ webhook: firma rechazada", firma.motivo);
    return responder(401, { error: "invalid_signature" });
  }

  // 2. Rutear por tipo. Los desconocidos se acusan recibo para que Mercado Pago no los reintente.
  const topic = topicSoportado(notificacion.tipo ?? url.searchParams.get("type"));
  if (!topic || !esIdSeguro(firma.dataId)) return responder(200, { ignored: "topic" });

  const r = await procesarNotificacionVitaPlus(topic, firma.dataId);
  return responder(r.http, r.cuerpo);
}
