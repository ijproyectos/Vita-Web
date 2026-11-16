// Orden y filtros PUROS de las observaciones (sin base de datos ni `server-only`).

import type { Observacion } from "./tipos";

type Ordenable = Pick<Observacion, "severidad" | "creada_at">;

/** Primero las de atención, y dentro de cada grupo la más nueva primero. No modifica el arreglo recibido. */
export function ordenarObservaciones<T extends Ordenable>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.severidad !== b.severidad) return a.severidad === "atencion" ? -1 : 1;
    return b.creada_at.localeCompare(a.creada_at);
  });
}

/** Las que se muestran hoy: vigentes y no descartadas. */
export function observacionesVisibles<T extends Pick<Observacion, "vigente_hasta" | "descartada_at">>(lista: T[], ahoraMs: number): T[] {
  return lista.filter((o) => !o.descartada_at && Date.parse(o.vigente_hasta) > ahoraMs);
}
