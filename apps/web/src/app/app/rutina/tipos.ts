import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";
import type { Turno } from "@/lib/turnos/tipos";

export type ItemRutina =
  | { tipo: "med"; hora: string; data: MedicamentoConToma }
  | { tipo: "turno"; hora: string; data: Turno };
