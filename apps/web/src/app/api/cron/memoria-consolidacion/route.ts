import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { enviarLoteConsolidacion, procesarLotesConsolidacion } from "@/lib/memoria/consolidacion";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Segundos; literal (Next lo lee estático). El envío es corto; el poll tiene su propio presupuesto (40 s).
export const maxDuration = 60;

/** Compara `x-cron-secret` contra `CRON_SECRET` en tiempo constante (mismo criterio que dosis-vencidas). */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const bufRecibido = Buffer.from(recibido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

/**
 * Consolidación nocturna de la memoria (migración 039). La invocan dos jobs de Supabase Cron (`pg_cron`/`pg_net`) con
 * `{"accion":"enviar"}` (una vez por día, 04:00 de Argentina: arma y manda el lote) y `{"accion":"procesar"}` (cada 15
 * minutos: archiva pasajeros vencidos y aplica los lotes que terminaron). Sin sesión de usuario: autenticada solo por
 * `x-cron-secret`. Devuelve solo conteos, nunca contenido.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  if (!secretoEsperado || !secretoValido(request.headers.get("x-cron-secret"), secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let accion: unknown = null;
  try {
    accion = ((await request.json()) as { accion?: unknown } | null)?.accion;
  } catch {
    // Cuerpo vacío o inválido: se rechaza abajo.
  }
  if (accion !== "enviar" && accion !== "procesar") {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (accion === "enviar") {
    return NextResponse.json({ ok: true, accion, ...(await enviarLoteConsolidacion(admin)) });
  }
  return NextResponse.json({ ok: true, accion, ...(await procesarLotesConsolidacion(admin)) });
}
