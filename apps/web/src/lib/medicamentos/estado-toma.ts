import { esDosisVencida } from "./nucleo";

// Estado de una toma para la vista "solo mirar": nadie la puede marcar desde
// ahí, solo se ve cómo viene el día.
export type EstadoToma = "tomada" | "omitida" | "sin-confirmar" | "mas-tarde";

export const ETIQUETA_ESTADO_TOMA: Record<EstadoToma, string> = {
  tomada: "Tomada",
  omitida: "No la tomó",
  "sin-confirmar": "Sin confirmar",
  "mas-tarde": "Más tarde",
};

export type TomaEntrada = { id: string; nombre: string; dosis: string; hora: string; tomado: boolean; omitida?: boolean };

export type FilaToma = TomaEntrada & { estado: EstadoToma; deAyer: boolean };

/**
 * Tomada si está marcada; "No la tomó" si la persona lo dijo (057: no cuenta
 * como sin confirmar); si no, vencida (sin confirmar) o todavía por llegar.
 */
export function estadoDeToma(tomado: boolean, hora: string, ahoraHHMM: string, omitida = false): EstadoToma {
  if (tomado) return "tomada";
  if (omitida) return "omitida";
  return esDosisVencida(hora, ahoraHHMM, 0) ? "sin-confirmar" : "mas-tarde";
}

/**
 * Filas de "Tomas de hoy": primero las de AYER que quedaron sin tomar (solo
 * llegan hasta la ventana de medianoche, ya filtradas por quien las lista),
 * después las de hoy por hora.
 */
export function filasTomas(hoy: TomaEntrada[], deAyer: TomaEntrada[], ahoraHHMM: string): FilaToma[] {
  const porHora = (a: TomaEntrada, b: TomaEntrada) => a.hora.localeCompare(b.hora);
  return [
    ...[...deAyer].sort(porHora).map((t) => ({ ...t, tomado: false, estado: "sin-confirmar" as const, deAyer: true })),
    ...[...hoy].sort(porHora).map((t) => ({ ...t, estado: estadoDeToma(t.tomado, t.hora, ahoraHHMM, t.omitida), deAyer: false })),
  ];
}

/**
 * Contador de "Tomas de hoy": igual que el inicio normal, cuenta solo las de
 * hoy (las de ayer se listan pero no suman). Sin tomas de hoy, no hay contador.
 */
export function contadorDeHoy(filas: FilaToma[]): { tomadas: number; total: number } | null {
  const deHoy = filas.filter((f) => !f.deAyer);
  if (deHoy.length === 0) return null;
  return { tomadas: deHoy.filter((f) => f.estado === "tomada").length, total: deHoy.length };
}
