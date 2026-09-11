export type MomentoDia = "mañana" | "mediodia" | "tarde" | "noche";

export type ConComida = "antes" | "con" | "despues" | "no-importa";

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
  unidad: string;
  hora_programada: string;
  momento_dia: MomentoDia;
  condicion: string | null;
  dias_recurrentes: DiaSemana[];
  frecuencia: string | null;
  con_comida: ConComida;
  duracion: string | null;
  notas: string | null;
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
  unidad?: string;
  horaProgramada: string;
  momentoDia: MomentoDia;
  condicion?: string | null;
  diasRecurrentes?: DiaSemana[];
  frecuencia?: string | null;
  conComida?: ConComida;
  duracion?: string | null;
  notas?: string | null;
};

// Hora default por momento — usada por el form nuevo (AgregarMedicamentoScreen
// del diseño) para crear una fila por cada momento elegido sin pedir un
// horario puntual por cada uno.
export const HORA_POR_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "08:00",
  mediodia: "13:00",
  tarde: "18:00",
  noche: "22:00",
};

// Datos comunes a todas las filas cuando se crea un medicamento aplicable a
// varios momentos del día a la vez (una fila por momento, mismo patrón que
// ya usa la app: una fila = un horario puntual).
export type DatosNuevoMedicamentoMultiMomento = {
  nombre: string;
  dosis?: string | null;
  unidad?: string;
  momentos: MomentoDia[];
  frecuencia?: string | null;
  conComida?: ConComida;
  duracion?: string | null;
  notas?: string | null;
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
