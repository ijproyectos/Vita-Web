import { fechaDeTomaEnAR, fechaEnAR } from "@/lib/medicamentos/nucleo";

export type ResultadoFechaAccion = { ok: true; fecha: string } | { ok: false; motivo: "sin_fecha" | "vencida" };

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the dose date carried by a push action button. A notification
 * tapped late (e.g. yesterday's "Ya la tomé" opened today) must never mark or
 * postpone TODAY's dose. An explicit invalid, stale or future date is refused
 * and the caller opens the app instead.
 *
 * A missing date is refused too: an old service worker that sends none must
 * never mark today's dose (it falls back to opening the app when this fails).
 *
 * - "tomada": the date must be the dose's current actionable date (today, or
 *   yesterday inside the post-midnight window, same rule as `marcarTomado`).
 * - "posponer": only today's dose can be postponed.
 */
export function validarFechaAccion(accion: "tomada" | "posponer", fecha: unknown, ahora: Date): ResultadoFechaAccion {
  if (typeof fecha !== "string" || !FORMATO_FECHA.test(fecha)) return { ok: false, motivo: "sin_fecha" };
  if (accion === "posponer") {
    return fecha === fechaEnAR(ahora) ? { ok: true, fecha } : { ok: false, motivo: "vencida" };
  }
  return fechaDeTomaEnAR(ahora, fecha) === fecha ? { ok: true, fecha } : { ok: false, motivo: "vencida" };
}
