import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarLlevar, type DatosActualizarTurno, type DatosNuevoTurno, type Turno } from "./tipos";
import { fechaDeHoyISO } from "@/lib/rutina/formato";
import { avisarTurnoAcompanado } from "@/lib/notificaciones/turno-acompanado";

// Mismo patrón que lib/medicamentos/nucleo.ts — funciones puras
// (supabase, usuarioId, ...), consumidas tanto por Server Actions como por
// una tool de chat (add_appointment en lib/ai/tools.ts).
type Cliente = SupabaseClient;

// `turnos.fecha` es fecha de pared en Argentina (la que eligió el usuario),
// así que "hoy" se compara en hora AR — en UTC, entre las 21:00 y las 23:59
// los turnos de hoy desaparecían de la Rutina.
function fechaDeHoy(): string {
  return fechaDeHoyISO();
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

// Columnas que agrega la migración 023: si todavía no existe, PostgREST
// responde con "column ... does not exist" (42703) o PGRST204.
function faltaColumna(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* (does not exist|of relation)|schema cache/i.test(error.message ?? "");
}

const COLUMNAS_023 = ["direccion", "telefono", "llevar"] as const;

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function agregar(
  supabase: Cliente,
  usuarioId: string,
  datos: DatosNuevoTurno
): Promise<Turno> {
  // Validación compartida (Server Actions y tool de chat): lanza Error, como
  // el resto de este núcleo; los llamadores lo convierten en estado de error.
  if (!FECHA_VALIDA.test(datos.fecha) || !HORA_VALIDA.test(datos.hora)) {
    throw new Error("Faltan datos del turno o tienen un formato inválido.");
  }
  if (datos.fecha < fechaDeHoy()) throw new Error("La fecha del turno ya pasó.");
  const base = {
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
  };
  // Las columnas de 023 solo se mandan si vienen: con la migración sin aplicar
  // el alta común no se rompe, y si vienen y faltan se reintenta sin ellas.
  const extra: Record<string, unknown> = {};
  if (datos.direccion !== undefined) extra.direccion = datos.direccion;
  if (datos.telefono !== undefined) extra.telefono = datos.telefono;
  if (datos.llevar !== undefined) extra.llevar = normalizarLlevar(datos.llevar);

  let { data, error } = await supabase.from("turnos").insert({ ...base, ...extra }).select().single();
  if (error && Object.keys(extra).length > 0 && faltaColumna(error)) {
    ({ data, error } = await supabase.from("turnos").insert(base).select().single());
  }

  if (error) throw new Error(`No se pudo crear el turno: ${error.message}`);
  const creado = data as Turno;
  // "Voy a ir acompañado": best-effort, nunca bloquea ni lanza (decisión del dueño 2026-10-30).
  if (creado.acompanado) await avisarTurnoAcompanado(supabase, creado.id, null);
  return creado;
}

/** Dueño (usuario_id) de un turno visible para la sesión (propio o de alguien que cuida), o null. */
export async function duenioDeTurno(supabase: Cliente, turnoId: string): Promise<string | null> {
  const { data, error } = await supabase.from("turnos").select("usuario_id").eq("id", turnoId).maybeSingle();
  if (error) throw new Error(`No se pudo leer el turno: ${error.message}`);
  return (data?.usuario_id as string | undefined) ?? null;
}

/**
 * Edita un turno existente: escribe solo los campos presentes en `datos`. Si
 * la migración 023 no está aplicada, los campos nuevos se descartan en
 * silencio y el resto se guarda igual.
 */
export async function actualizar(
  supabase: Cliente,
  usuarioId: string,
  turnoId: string,
  datos: DatosActualizarTurno
): Promise<Turno> {
  const cambios: Record<string, unknown> = {};
  if (datos.especialidad !== undefined) cambios.especialidad = datos.especialidad;
  if (datos.profesional !== undefined) cambios.profesional = datos.profesional;
  if (datos.lugar !== undefined) cambios.lugar = datos.lugar;
  if (datos.fecha !== undefined) cambios.fecha = datos.fecha;
  if (datos.hora !== undefined) cambios.hora = datos.hora;
  if (datos.motivo !== undefined) cambios.motivo = datos.motivo;
  if (datos.recordatorio !== undefined) cambios.recordatorio = datos.recordatorio;
  if (datos.acompanado !== undefined) cambios.acompanado = datos.acompanado;
  if (datos.notas !== undefined) cambios.notas = datos.notas;
  if (datos.direccion !== undefined) cambios.direccion = datos.direccion;
  if (datos.telefono !== undefined) cambios.telefono = datos.telefono;
  if (datos.llevar !== undefined) cambios.llevar = normalizarLlevar(datos.llevar);

  // Estado previo, para avisar a los cuidadores solo si "acompañado" se prende o cambia el día/hora.
  const { data: antes } = await supabase
    .from("turnos")
    .select("acompanado, fecha, hora")
    .eq("id", turnoId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  const intentar = (c: Record<string, unknown>) =>
    supabase.from("turnos").update(c).eq("id", turnoId).eq("usuario_id", usuarioId).select().single();

  let { data, error } = await intentar(cambios);
  if (error && faltaColumna(error)) {
    const sin = Object.fromEntries(Object.entries(cambios).filter(([k]) => !(COLUMNAS_023 as readonly string[]).includes(k)));
    if (Object.keys(sin).length === 0) throw new Error("Esta función todavía no está disponible.");
    ({ data, error } = await intentar(sin));
  }

  if (error) throw new Error(`No se pudo actualizar el turno: ${error.message}`);
  const guardado = data as Turno;
  if (guardado.acompanado) {
    const previo = antes
      ? { acompanado: antes.acompanado === true, fecha: String(antes.fecha), hora: String(antes.hora) }
      : null;
    await avisarTurnoAcompanado(supabase, guardado.id, previo);
  }
  return guardado;
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

/** ¿Existen las columnas de la migración 023 (dirección, teléfono, "Qué llevar")? Nunca lanza. */
export async function detallesDisponibles(supabase: Cliente): Promise<boolean> {
  const { error } = await supabase.from("turnos").select("llevar").limit(1);
  return !error;
}
