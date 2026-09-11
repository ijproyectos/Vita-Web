import type { MomentoDia } from "@/lib/medicamentos/tipos";

// Deriva el momento del día a partir de una hora "HH:MM" — usado tanto por
// medicamentos (para no pedirlo dos veces, form nuevo solo pide horario
// puntual en la ruta avanzada) como por turnos (que no tienen columna
// propia de momento_dia, se agrupan en la Rutina con este mismo criterio).
// Rangos calcados de RutinaScreen.jsx: mañana 06–11, mediodía 11–15,
// tarde 15–19, noche 19–24 (y madrugada 00–06 también cae en "noche").
export function momentoDelDia(hora: string): MomentoDia {
  const horaNum = Number(hora.split(":")[0] ?? 0);
  if (horaNum >= 6 && horaNum < 11) return "mañana";
  if (horaNum >= 11 && horaNum < 15) return "mediodia";
  if (horaNum >= 15 && horaNum < 19) return "tarde";
  return "noche";
}

export const ETIQUETA_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "Mañana",
  mediodia: "Mediodía",
  tarde: "Tarde",
  noche: "Noche",
};

export const RANGO_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "06 – 11",
  mediodia: "11 – 15",
  tarde: "15 – 19",
  noche: "19 – 24",
};

export const ORDEN_MOMENTOS: MomentoDia[] = ["mañana", "mediodia", "tarde", "noche"];
