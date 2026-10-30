import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { enviarLoteConsolidacion, procesarLotesConsolidacion } from "@/lib/memoria/consolidacion";
import { PRESUPUESTO_ENVIO_MS, PRESUPUESTO_POLL_MS } from "@/lib/memoria/consolidacion-logica";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Segundos; literal (Next lo lee estático). Netlify corta las funciones síncronas a ~10 s: el trabajo se acota por presupuesto
// de tiempo (PRESUPUESTO_ENVIO_MS / PRESUPUESTO_POLL_MS), no por esperar a que termine.
export const maxDuration = 10;

/** Compara `x-cron-secret` contra `CRON_SECRET` en tiempo constante (mismo criterio que dosis-vencidas). */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const bufRecibido = Buffer.from(recibido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

/**
 * Consolidación nocturna de la memoria (migración 043). Lo invocan dos jobs de Supabase Cron (`pg_cron`/`pg_net`):
 * `?accion=enviar` (03:00 de Argentina: arma y manda el lote) y `?accion=procesar` (cada 30 minutos: consulta el lote en
 * vuelo y aplica lo terminado; sin lote no hace nada). Sin sesión de usuario: autenticado solo por `x-cron-secret`.
 * Devuelve únicamente conteos, nunca contenido.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  if (!secretoEsperado || !secretoValido(request.headers.get("x-cron-secret"), secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const accion = new URL(request.url).searchParams.get("accion");
  if (accion !== "enviar" && accion !== "procesar") {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }
  const admin = createAdminClient();
  if (accion === "enviar") {
    return NextResponse.json({ ok: true, accion, ...(await enviarLoteConsolidacion(admin, { presupuestoMs: PRESUPUESTO_ENVIO_MS })) });
  }
  return NextResponse.json({ ok: true, accion, ...(await procesarLotesConsolidacion(admin, { presupuestoMs: PRESUPUESTO_POLL_MS })) });
}
