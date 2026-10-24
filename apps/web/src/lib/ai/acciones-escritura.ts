// Acciones de UI (`accionUI.type` de lib/ai/tools.ts) que significan que vita
// ESCRIBIÓ algo. El overlay refresca las pantallas del servidor cuando llega
// alguna; las de solo lectura/UI (show_*, avatar_mood, opciones_confirmacion) no cambian datos.
const ACCIONES_ESCRITURA = new Set([
  "medication_added",
  "medication_deleted",
  "medication_taken",
  "all_medications_taken",
  "schedule_updated",
  "appointment_added",
  "profile_updated",
  "condition_added",
  "allergy_added",
]);

export function esAccionDeEscritura(tipo: string): boolean {
  return ACCIONES_ESCRITURA.has(tipo);
}
