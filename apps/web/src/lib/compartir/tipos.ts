// Tipos del dominio "Compartir con profesional" — ver
// supabase/migrations/015_enlaces_profesional.sql. Sin lógica de servidor
// para poder importarlos desde componentes cliente.

export type DuracionEnlace = "24h" | "7d" | "30d";

export const DURACIONES: { valor: DuracionEnlace; label: string; horas: number }[] = [
  { valor: "24h", label: "24 horas", horas: 24 },
  { valor: "7d", label: "7 días", horas: 7 * 24 },
  { valor: "30d", label: "30 días", horas: 30 * 24 },
];

export const DURACION_DEFAULT: DuracionEnlace = "7d";

export const ETIQUETA_MAX = 60;

export type EstadoEnlace = "activo" | "vencido" | "revocado";

export type EnlaceProfesional = {
  id: string;
  etiqueta: string | null;
  expira_at: string;
  revocado_at: string | null;
  created_at: string;
  ultimo_acceso_at: string | null;
  accesos: number;
  estado: EstadoEnlace;
};

/** Resultado de crear: el token crudo existe SOLO acá, nunca se persiste. */
export type EnlaceCreado = { token: string; expira_at: string };

// Documento jsonb que devuelve la RPC `resumen_profesional`. Sin email,
// ids, chat, cuidadores ni paths de archivos (por construcción en SQL).
export type ResumenProfesional = {
  generado_en: string;
  vigente_hasta: string;
  paciente: {
    nombre: string | null;
    edad: number | null;
    edad_rango: string | null;
    genero: string | null;
    grupo_sanguineo: string | null;
    altura_cm: number | null;
    peso_kg: number | null;
    obra_social: string | null;
  };
  condiciones: { label: string; tipo: string; desde: string }[];
  alergias: string[];
  medicamentos: {
    nombre: string;
    dosis: string | null;
    unidad: string;
    hora: string;
    momento: "mañana" | "mediodia" | "tarde" | "noche";
    dias: string[];
    con_comida: string;
    frecuencia: string | null;
    duracion: string | null;
    condicion: string | null;
    notas: string | null;
    pastillas_restantes: number | null;
  }[];
  adherencia: {
    dias: number;
    programadas: number;
    tomadas: number;
    porcentaje: number | null;
    por_dia: { fecha: string; programadas: number; tomadas: number }[];
  };
  turnos: {
    especialidad: string;
    profesional: string | null;
    lugar: string | null;
    fecha: string;
    hora: string;
    motivo: string | null;
  }[];
  estudios: {
    tipo: string | null;
    fecha: string | null;
    resumen: string | null;
    valores: { nombre: string; valor: string }[];
  }[];
  contacto_emergencia: { nombre: string | null; telefono: string | null };
};
