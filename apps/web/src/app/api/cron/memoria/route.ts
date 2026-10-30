import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { procesarPendientes } from "@/lib/memoria/resumen";
import { PRESUPUESTO_CRON_MS } from "@/lib/memoria/resumen-logica";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Segundos; literal (Next lo lee estático). Netlify corta las funciones síncronas a ~10 s: el trabajo se acota por
// presupuesto de tiempo (PRESUPUESTO_CRON_MS), no por esperar a que termine.
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
 * Trabajador del resumen de conversación (migración 041). Lo invoca Supabase Cron (`pg_cron`/`pg_net`) cada 15 minutos.
 * Sin sesión de usuario: autenticado solo por `x-cron-secret`. Procesa pocas personas por tick, solo mientras quede
 * tiempo para una llamada completa, y devuelve únicamente conteos, nunca contenido.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  if (!secretoEsperado || !secretoValido(request.headers.get("x-cron-secret"), secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const tick = await procesarPendientes(createAdminClient(), { presupuestoMs: PRESUPUESTO_CRON_MS });
  return NextResponse.json({ ok: true, ...tick });
}
