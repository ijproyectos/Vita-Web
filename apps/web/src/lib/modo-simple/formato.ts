// Formato PURO para la pantalla de la persona (letra grande, frases habladas).

/** "10:00" -> "A las 10 de la mañana"; "13:30" -> "A la 1 y media de la tarde". */
export function horaEnPalabras(hhmm: string): string {
  const [hs, ms] = hhmm.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const articulo = h12 === 1 ? "A la" : "A las";
  const minutos = m === 0 ? "" : m === 30 ? " y media" : `:${String(m).padStart(2, "0")}`;
  const cuando = h === 12 ? "del mediodía" : h < 12 ? "de la mañana" : h < 20 ? "de la tarde" : "de la noche";
  return `${articulo} ${h12}${minutos} ${cuando}`;
}

/** Días enteros entre dos fechas "YYYY-MM-DD" (b - a). */
export function diasEntre(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

/** "Hoy" / "Ayer" / "Hace 3 días" a partir de los días de diferencia. */
export function haceCuanto(dias: number): string {
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

/** Hora de pared argentina ("HH:MM") de un instante. Seguro en el cliente (a diferencia de `horaEnAR`, que vive en un módulo server-only). */
export function horaActualEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}
