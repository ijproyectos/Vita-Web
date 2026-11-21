import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { procesarObservaciones } from "@/lib/observaciones/generar";
import { PRESUPUESTO_CRON_MS } from "@/lib/observaciones/generar-logica";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Segundos; literal (Next lo lee estático). Netlify corta las funciones síncronas a ~10 s: el trabajo se acota por
// presupuesto de tiempo (PRESUPUESTO_CRON_MS) y las personas se recorren por lotes con un cursor.
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
 * Observaciones de vita, etapa 1 (migración 062). Lo invoca Supabase Cron (`pg_cron`/`pg_net`) cada 15 minutos entre
 * las 08:00 y las 10:59 AR. Sin sesión de usuario: autenticado solo por `x-cron-secret`. Devuelve únicamente conteos,
 * nunca texto de observaciones. Sin la migración 062 responde 200 con `saltado` y no hace nada.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  if (!secretoEsperado || !secretoValido(request.headers.get("x-cron-secret"), secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const resumen = await procesarObservaciones(createAdminClient(), { presupuestoMs: PRESUPUESTO_CRON_MS });
  // Un error transitorio responde 503 (pg_net no reintenta, pero el próximo tick retoma desde el cursor).
  return NextResponse.json(resumen, { status: resumen.ok ? 200 : 503 });
}
