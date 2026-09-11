export type Turno = {
  id: string;
  usuario_id: string;
  especialidad: string;
  profesional: string | null;
  lugar: string | null;
  fecha: string; // "YYYY-MM-DD"
  hora: string; // "HH:MM"
  motivo: string | null;
  recordatorio: string | null;
  acompanado: boolean;
  notas: string | null;
  created_at: string;
};

export type DatosNuevoTurno = {
  especialidad: string;
  profesional?: string | null;
  lugar?: string | null;
  fecha: string;
  hora: string;
  motivo?: string | null;
  recordatorio?: string | null;
  acompanado?: boolean;
  notas?: string | null;
};

export const ESPECIALIDADES_SUGERIDAS = [
  "Clínica",
  "Cardiología",
  "Gastroenterología",
  "Ginecología",
  "Endocrinología",
  "Laboratorio",
  "Imágenes",
  "Otro",
] as const;
