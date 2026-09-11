import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosNuevoTurno, Turno } from "./tipos";

// Mismo patrón que lib/medicamentos/nucleo.ts — funciones puras
// (supabase, usuarioId, ...), consumidas tanto por Server Actions como por
// una tool de chat (add_appointment en lib/ai/tools.ts).
type Cliente = SupabaseClient;

function fechaDeHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listarProximos(
  supabase: Cliente,
  usuarioId: string,
  limite = 10
): Promise<Turno[]> {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .gte("fecha", fechaDeHoy())
    .order("fecha", { ascending: true })
    .order("hora", { ascending: true })
    .limit(limite);

  if (error) throw new Error(`No se pudieron leer los turnos: ${error.message}`);
  return data as Turno[];
}

export async function listarDeHoy(supabase: Cliente, usuarioId: string): Promise<Turno[]> {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("fecha", fechaDeHoy())
    .order("hora", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los turnos de hoy: ${error.message}`);
  return data as Turno[];
}

export async function obtenerPorId(
  supabase: Cliente,
  usuarioId: string,
  turnoId: string
): Promise<Turno | null> {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("id", turnoId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el turno: ${error.message}`);
  return data as Turno | null;
}

export async function agregar(
  supabase: Cliente,
  usuarioId: string,
  datos: DatosNuevoTurno
): Promise<Turno> {
  const { data, error } = await supabase
    .from("turnos")
    .insert({
      usuario_id: usuarioId,
      especialidad: datos.especialidad,
      profesional: datos.profesional ?? null,
      lugar: datos.lugar ?? null,
      fecha: datos.fecha,
      hora: datos.hora,
      motivo: datos.motivo ?? null,
      recordatorio: datos.recordatorio ?? null,
      acompanado: datos.acompanado ?? false,
      notas: datos.notas ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`No se pudo crear el turno: ${error.message}`);
  return data as Turno;
}

export async function eliminar(
  supabase: Cliente,
  usuarioId: string,
  turnoId: string
): Promise<void> {
  const { error } = await supabase
    .from("turnos")
    .delete()
    .eq("id", turnoId)
    .eq("usuario_id", usuarioId);

  if (error) throw new Error(`No se pudo eliminar el turno: ${error.message}`);
}
