// Datos de las tarjetas "Hoy" y "Tus remedios" del chat. Lógica pura.
// Las tarjetas viajan por el stream y no se guardan: siempre son del momento.

import { textoDosis } from "@/lib/medicamentos/tipos";

export const REMEDIOS_TARJETA_VISIBLES = 6;

type ConHorario = { nombre: string; dosis: string | null; unidad: string; hora_programada: string; fecha_fin?: string | null };

export type ItemHoy = { hora: string; nombre: string; dosis: string | null; tomado: boolean };
export type ItemRemedio = { nombre: string; dosis: string | null; horas: string[] };

const dosisDe = (m: ConHorario) => textoDosis(m) || null;

export function itemsDeHoy(meds: (ConHorario & { tomado: boolean })[]): ItemHoy[] {
  return meds
    .map((m) => ({ hora: m.hora_programada.slice(0, 5), nombre: m.nombre, dosis: dosisDe(m), tomado: m.tomado }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

/** Un remedio con varios horarios son varias filas: acá va uno solo con sus horas. Sin los ya terminados. */
export function itemsDeRemedios(meds: ConHorario[], hoy: string): ItemRemedio[] {
  const grupos = new Map<string, ItemRemedio>();
  for (const m of meds) {
    if (m.fecha_fin && m.fecha_fin.slice(0, 10) < hoy) continue;
    const dosis = dosisDe(m);
    const clave = `${m.nombre.trim().toLowerCase()}|${dosis ?? ""}`;
    const grupo = grupos.get(clave) ?? { nombre: m.nombre, dosis, horas: [] };
    grupo.horas.push(m.hora_programada.slice(0, 5));
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].map((g) => ({ ...g, horas: [...g.horas].sort() })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que llega por el stream no se confía tal cual. */
export function leerItemsHoy(crudo: unknown): ItemHoy[] | null {
  if (!Array.isArray(crudo)) return null;
  return crudo.filter((x): x is ItemHoy => typeof x?.hora === "string" && typeof x?.nombre === "string").map((x) => ({ hora: x.hora, nombre: x.nombre, dosis: typeof x.dosis === "string" ? x.dosis : null, tomado: x.tomado === true }));
}

export function leerItemsRemedios(crudo: unknown): ItemRemedio[] | null {
  if (!Array.isArray(crudo)) return null;
  return crudo
    .filter((x): x is ItemRemedio => typeof x?.nombre === "string" && Array.isArray(x?.horas))
    .map((x) => ({ nombre: x.nombre, dosis: typeof x.dosis === "string" ? x.dosis : null, horas: x.horas.filter((h: unknown): h is string => typeof h === "string") }));
}
