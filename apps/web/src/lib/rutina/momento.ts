import type { MomentoDia } from "@/lib/medicamentos/tipos";

// Deriva el momento del día a partir de una hora "HH:MM" — usado tanto por
// medicamentos (para no pedirlo dos veces, form nuevo solo pide horario
// puntual en la ruta avanzada) como por turnos (que no tienen columna
// propia de momento_dia, se agrupan en la Rutina con este mismo criterio).
// Franjas del día en Argentina: mañana 07–12, mediodía 12–14, tarde 14–20,
// noche 20–07 (la madrugada 00–07 también cae en "noche").
export function momentoDelDia(hora: string): MomentoDia {
  const horaNum = Number(hora.split(":")[0] ?? 0);
  if (horaNum >= 7 && horaNum < 12) return "mañana";
  if (horaNum >= 12 && horaNum < 14) return "mediodia";
  if (horaNum >= 14 && horaNum < 20) return "tarde";
  return "noche";
}

export const ETIQUETA_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "Mañana",
  mediodia: "Mediodía",
  tarde: "Tarde",
  noche: "Noche",
};

export const RANGO_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "07 – 12",
  mediodia: "12 – 14",
  tarde: "14 – 20",
  noche: "20 – 07",
};

export const ORDEN_MOMENTOS: MomentoDia[] = ["mañana", "mediodia", "tarde", "noche"];

/** "8:05" / "08:05" / "08:05:00" -> "08:05"; null si no es una hora válida. */
export function normalizarHora(crudo: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(crudo.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
