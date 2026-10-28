import { fechaDeTomaEnAR, fechaEnAR } from "@/lib/medicamentos/nucleo";

export type ResultadoFechaAccion = { ok: true; fecha: string; inferida?: true } | { ok: false; motivo: "sin_fecha" | "vencida" };

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the dose date carried by a push action button. A notification
 * tapped late (e.g. yesterday's "Ya la tomé" opened today) must never mark or
 * postpone TODAY's dose. An explicit invalid, stale or future date is refused
 * and the caller opens the app instead.
 *
 * Rollout tolerance: service workers deployed before the date existed send
 * none. An absent date is treated as today's AR date and flagged `inferida`, so
 * the caller must also check the dose is scheduled today. Remove this fallback
 * once the old service workers are gone (about 24 h after the deploy).
 *
 * - "tomada": the date must be the dose's current actionable date (today, or
 *   yesterday inside the post-midnight window, same rule as `marcarTomado`).
 * - "posponer": only today's dose can be postponed.
 */
export function validarFechaAccion(accion: "tomada" | "posponer", fecha: unknown, ahora: Date): ResultadoFechaAccion {
  if (fecha === undefined || fecha === null) return { ok: true, fecha: fechaEnAR(ahora), inferida: true };
  if (typeof fecha !== "string" || !FORMATO_FECHA.test(fecha)) return { ok: false, motivo: "sin_fecha" };
  if (accion === "posponer") {
    return fecha === fechaEnAR(ahora) ? { ok: true, fecha } : { ok: false, motivo: "vencida" };
  }
  return fechaDeTomaEnAR(ahora, fecha) === fecha ? { ok: true, fecha } : { ok: false, motivo: "vencida" };
}
