import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { procesarCola } from "@/lib/memoria/resumen";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Segundos; literal (Next lo lee estático). Alcanza para varias tareas por tick (cada una es una llamada corta a Haiku).
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
 * Trabajador de la cola de memoria (migración 037). Lo invoca Supabase Cron (`pg_cron`/`pg_net`) cada minuto y
 * es el respaldo del `after()` del chat. Sin sesión de usuario: autenticado solo por `x-cron-secret`. Toma hasta
 * 3 tareas por tick (`tomar_tarea_memoria`, con reserva de 2 minutos) y devuelve solo conteos, nunca contenido.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  if (!secretoEsperado || !secretoValido(request.headers.get("x-cron-secret"), secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const resumen = await procesarCola(createAdminClient(), { maxTareas: 3, presupuestoMs: 45_000 });
  return NextResponse.json({ ok: true, ...resumen });
}
