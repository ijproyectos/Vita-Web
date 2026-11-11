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

/**
 * Single hour normalizer of the app. "8:05" / "08:05" / "08:05:00" -> "08:05".
 * Seconds are only accepted as ":00" with a two-digit hour. null for anything else (seconds other than 00, hours > 23, minutes > 59, junk).
 */
export function normalizarHora(crudo: string): string | null {
  if (typeof crudo !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$|^(\d{2}):(\d{2}):00$/.exec(crudo.trim());
  if (!m) return null;
  const h = Number(m[1] ?? m[3]);
  const minutos = m[2] ?? m[4];
  if (h > 23 || Number(minutos) > 59) return null;
  return `${String(h).padStart(2, "0")}:${minutos}`;
}

/** Suma o resta minutos a una hora "HH:MM", dando la vuelta al día. */
export function moverHora(hora: string, delta: number): string {
  const [h, m] = hora.split(":").map(Number);
  const n = ((((h || 0) * 60 + (m || 0) + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

// Límites de cada momento en minutos del día (mismos cortes que momentoDelDia;
// la noche cruza la medianoche: 20:00 a 07:00).
const LIMITES_MOMENTO: Record<MomentoDia, [number, number]> = {
  "mañana": [7 * 60, 12 * 60],
  mediodia: [12 * 60, 14 * 60],
  tarde: [14 * 60, 20 * 60],
  noche: [20 * 60, 31 * 60],
};

/** Cuánto le falta a una hora para caer dentro de un momento (0 = adentro). */
export function minutosFueraDelMomento(hora: string, momento: MomentoDia): number {
  const [h, m] = hora.split(":").map(Number);
  const t = (h || 0) * 60 + (m || 0);
  const [desde, hasta] = LIMITES_MOMENTO[momento];
  return Math.min(
    ...[-1440, 0, 1440].map((k) => {
      const x = t + k;
      return x < desde ? desde - x : x >= hasta ? x - hasta : 0;
    })
  );
}

/** Margen en que una hora "cercana" se respeta al elegir un momento (06:30 sigue siendo mañana). */
export const TOLERANCIA_MOMENTO_MIN = 45;

/**
 * Hora al elegir un momento del día: si la hora ya está en ese momento o cerca
 * (hasta TOLERANCIA_MOMENTO_MIN afuera) se respeta; si queda lejos (08:00 con
 * "Noche") pasa a la hora sugerida del momento.
 */
export function horaParaMomento(hora: string, momento: MomentoDia, sugerida: string): string {
  return minutosFueraDelMomento(hora, momento) <= TOLERANCIA_MOMENTO_MIN ? hora : sugerida;
}
