// Tipos de las observaciones de vita. Puro y sin `server-only`.

export const TIPOS_OBSERVACION = [
  "stock_bajo_dias",
  "tomas_salteadas",
  "presion_alta",
  "glucemia_fuera_rango",
  "estudio_fuera_rango",
  "turno_cerca",
  "tratamiento_termina",
  "medicion_pendiente",
  "familia_sin_tomas",
] as const;
export type TipoObservacion = (typeof TIPOS_OBSERVACION)[number];

export type SeveridadObservacion = "info" | "atencion";

/** Lo que produce una regla: todavía sin id ni fechas de lectura. */
export type ObservacionNueva = {
  tipo: TipoObservacion;
  severidad: SeveridadObservacion;
  /** Clave de dedupe (tipo + referencia + semana o fecha). */
  clave: string;
  titulo: string;
  texto: string;
  /** Solo números e ids para enlazar; nunca texto de usuarios. */
  datos: Record<string, string | number | boolean | null | (string | number)[]>;
  href: string | null;
  /** Instante ISO hasta el que sigue vigente. */
  vigente_hasta: string;
};

/** Fila de `observaciones` tal como la lee la app. */
export type Observacion = ObservacionNueva & {
  id: string;
  usuario_id: string;
  creada_at: string;
  vista_at: string | null;
  descartada_at: string | null;
};

// --- Datos de entrada de las reglas (ya leídos; las reglas no tocan la base) ---

export type MedicamentoObs = {
  id: string;
  nombre: string;
  forma: string | null;
  momento_dia: string;
  hora_programada: string;
  /** Vacío = todos los días. Sin tildes: "lunes" ... "domingo". */
  dias_recurrentes: string[];
  cantidad_por_toma: number | null;
  inventario_id: string | null;
  /** "YYYY-MM-DD" inclusive; null = sin fin. */
  fecha_fin: string | null;
  /** Instante ISO de alta. */
  created_at: string;
};

export type InventarioObs = { id: string; nombre: string; stock: number; pastillas_por_toma: number };

export type TomaObs = { medicamento_id: string; fecha: string; tomado: boolean; omitida_at: string | null };

export type MedicionObs = {
  tipo: string;
  nombre_otra: string | null;
  valor: number;
  valor_secundario: number | null;
  medido_at: string;
};

export type MonitoreoObs = {
  id: string;
  tipo: string;
  nombre_otra: string | null;
  fecha_fin: string | null;
  created_at: string;
};

export type ValorEstudioObs = {
  nombre: string;
  estado?: string | null;
  rango_min?: number | null;
  rango_max?: number | null;
  rango_texto?: string | null;
};

export type EstudioObs = { id: string; tipo: string | null; created_at: string; valores: ValorEstudioObs[] };

export type TurnoObs = { id: string; especialidad: string; fecha: string; hora: string; llevar: unknown };

export type DatosPersonaObs = {
  /** La persona dueña de los datos. */
  personaId: string;
  /** Fecha AR de hoy, "YYYY-MM-DD". */
  hoy: string;
  /** Hora AR actual, "HH:MM". */
  hora: string;
  nombre: string;
  medicamentos: MedicamentoObs[];
  inventarios: InventarioObs[];
  /** Tomas de los últimos ~8 días (el generador trae de más; las reglas filtran por fecha). */
  tomas: TomaObs[];
  mediciones: MedicionObs[];
  monitoreos: MonitoreoObs[];
  estudios: EstudioObs[];
  turnos: TurnoObs[];
  /** Cuidadores aceptados con rol 'editar' (regla de familia sin tomas). */
  cuidadoresEditores: number;
};
