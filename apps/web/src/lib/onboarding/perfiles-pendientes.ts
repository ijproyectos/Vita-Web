import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DatosNuevoMedicamentoPendiente,
  DatosNuevoPerfilPendiente,
  MedicamentoPendiente,
  PerfilPendiente,
} from "./tipos";

// Núcleo de perfiles/medicamentos en borrador del onboarding conversacional
// nuevo — mismo criterio `(supabase, ...)` que el resto del dominio (ver
// lib/cuidadores/nucleo.ts). Son inserts/selects planos (sin RPC), así que,
// mismo criterio que el resto de los inserts planos del proyecto (ej.
// medicamentosNucleo.agregar), SÍ pueden lanzar — quien llama (una Server
// Action) es responsable de atrapar la excepción.
type Cliente = SupabaseClient;

export async function crearPerfilPendiente(
  supabase: Cliente,
  cuidadorId: string,
  datos: DatosNuevoPerfilPendiente
): Promise<PerfilPendiente> {
  const { data, error } = await supabase
    .from("perfiles_pendientes")
    .insert({
      cuidador_id: cuidadorId,
      nombre: datos.nombre,
      relacion: datos.relacion ?? null,
      edad: datos.edad ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`No se pudo crear el perfil: ${error.message}`);
  return data as PerfilPendiente;
}

export async function listarMedicamentosPendientes(
  supabase: Cliente,
  perfilPendienteId: string
): Promise<MedicamentoPendiente[]> {
  const { data, error } = await supabase
    .from("medicamentos_pendientes")
    .select("*")
    .eq("perfil_pendiente_id", perfilPendienteId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los medicamentos: ${error.message}`);
  return data as MedicamentoPendiente[];
}

export async function agregarMedicamentoPendiente(
  supabase: Cliente,
  perfilPendienteId: string,
  datos: DatosNuevoMedicamentoPendiente
): Promise<MedicamentoPendiente> {
  const { data, error } = await supabase
    .from("medicamentos_pendientes")
    .insert({
      perfil_pendiente_id: perfilPendienteId,
      nombre: datos.nombre,
      dosis: datos.dosis ?? null,
      unidad: datos.unidad ?? "mg",
      hora_programada: datos.horaProgramada,
      momento_dia: datos.momentoDia,
      con_comida: datos.conComida ?? "no-importa",
      frecuencia: datos.frecuencia ?? null,
      duracion: datos.duracion ?? null,
      notas: datos.notas ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`No se pudo crear el medicamento: ${error.message}`);
  return data as MedicamentoPendiente;
}
