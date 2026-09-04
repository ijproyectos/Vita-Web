export type MomentoDia = "mañana" | "mediodia" | "noche";

export type DiaSemana =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export const DIAS_SEMANA: DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

export type Medicamento = {
  id: string;
  usuario_id: string;
  nombre: string;
  dosis: string | null;
  hora_programada: string;
  momento_dia: MomentoDia;
  condicion: string | null;
  dias_recurrentes: DiaSemana[];
  created_at: string;
  updated_at: string;
};

export type MedicamentoConToma = Medicamento & {
  tomado: boolean;
  toma_id: string | null;
};

export type DatosNuevoMedicamento = {
  nombre: string;
  dosis?: string | null;
  horaProgramada: string;
  momentoDia: MomentoDia;
  condicion?: string | null;
  diasRecurrentes?: DiaSemana[];
};

export type DatosActualizarHorario = {
  horaProgramada?: string;
  momentoDia?: MomentoDia;
  diasRecurrentes?: DiaSemana[];
};

export type EstadisticaAdherencia = {
  medicamentoId: string;
  nombre: string;
  tomados: number;
  esperados: number;
  porcentaje: number;
};

export type ResumenAdherencia = {
  porcentaje: number;
  rachaDias: number;
  medicamentos: EstadisticaAdherencia[];
};
