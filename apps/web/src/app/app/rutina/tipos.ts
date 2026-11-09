import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";
import type { Turno } from "@/lib/turnos/tipos";

/** Fila "Medir la presión" de la Rutina de hoy. */
export type ItemMedir = { clave: string; hora: string; titulo: string; valor: string | null; href: string };

export type ItemRutina =
  | { tipo: "med"; hora: string; data: MedicamentoConToma }
  | { tipo: "turno"; hora: string; data: Turno };
