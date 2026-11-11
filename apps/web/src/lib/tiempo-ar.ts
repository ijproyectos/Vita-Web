// Fecha y hora de Argentina, en un solo lugar. PURO y sin `server-only`: lo
// usan el servidor, los formularios y las pantallas. Argentina no tiene horario
// de verano, así que un día son siempre 24 h exactas.

export const ZONA_AR = "America/Argentina/Buenos_Aires";

/** Fecha calendario AR "YYYY-MM-DD" (`toISOString()` da la UTC, que de 21:00 a 23:59 AR ya es mañana). */
export function fechaEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_AR, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

/** "HH:MM" (o "H:MM", "HH:MM:SS") -> minutos desde las 00:00. Sin validar: quien llama ya normalizó. */
export function minutosDelDia(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
