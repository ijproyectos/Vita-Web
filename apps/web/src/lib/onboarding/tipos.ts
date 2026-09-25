// Tipos del onboarding conversacional nuevo — perfiles/medicamentos en
// borrador (staging) del cuidador ANTES de que la persona cuidada tenga
// cuenta propia. Ver supabase/migrations/012_perfiles_y_medicamentos_pendientes.sql
// para el schema real. Mismo criterio que el resto del proyecto: tipos
// mínimos, sin lógica.
import type { ConComida, MomentoDia } from "@/lib/medicamentos/tipos";

export type PerfilPendiente = {
  id: string;
  cuidador_id: string;
  nombre: string;
  relacion: string | null;
  edad: number | null;
  vinculo_id: string | null;
  estado: "borrador" | "vinculado";
  created_at: string;
};

export type MedicamentoPendiente = {
  id: string;
  perfil_pendiente_id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  hora_programada: string;
  momento_dia: MomentoDia;
  con_comida: ConComida;
  frecuencia: string | null;
  duracion: string | null;
  notas: string | null;
  created_at: string;
};

export type DatosNuevoPerfilPendiente = {
  nombre: string;
  relacion?: string | null;
  edad?: number | null;
};

export type DatosNuevoMedicamentoPendiente = {
  nombre: string;
  dosis?: string | null;
  unidad?: string;
  horaProgramada: string;
  momentoDia: MomentoDia;
  conComida?: ConComida;
  frecuencia?: string | null;
  duracion?: string | null;
  notas?: string | null;
};
