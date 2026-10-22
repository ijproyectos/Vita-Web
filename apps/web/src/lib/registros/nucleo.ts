import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Consulta, OrigenRegistro, Vacuna } from "./tipos";

// Consultas y vacunas (migración 024). Solo lectura: el diseño V7 no tiene
// pantalla de alta. La RLS decide el acceso (dueño, o cuidador vinculado).
type Cliente = SupabaseClient;
type Fila = Record<string, unknown>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function origen(v: unknown): OrigenRegistro {
  return v === "vita" ? "vita" : "manual";
}

export async function listarConsultas(supabase: Cliente, usuarioId: string, limite = 100): Promise<Consulta[]> {
  const { data, error } = await supabase
    .from("consultas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("fecha", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las consultas: ${error.message}`);
  return ((data ?? []) as Fila[])
    .filter((f) => typeof f.fecha === "string" && FECHA.test(f.fecha) && texto(f.especialidad))
    .map((f) => ({
      id: String(f.id),
      fecha: String(f.fecha),
      especialidad: texto(f.especialidad)!,
      profesional: texto(f.profesional),
      lugar: texto(f.lugar),
      resumen: texto(f.resumen),
      origen: origen(f.origen),
      created_at: String(f.created_at ?? ""),
    }));
}

export async function listarVacunas(supabase: Cliente, usuarioId: string, limite = 100): Promise<Vacuna[]> {
  const { data, error } = await supabase
    .from("vacunas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("fecha", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las vacunas: ${error.message}`);
  return ((data ?? []) as Fila[])
    .filter((f) => typeof f.fecha === "string" && FECHA.test(f.fecha) && texto(f.nombre))
    .map((f) => ({
      id: String(f.id),
      nombre: texto(f.nombre)!,
      fecha: String(f.fecha),
      dosis: texto(f.dosis),
      lugar: texto(f.lugar),
      origen: origen(f.origen),
      created_at: String(f.created_at ?? ""),
    }));
}

/** Nunca lanzan: con la migración 024 sin aplicar la lista queda vacía. */
export async function listarConsultasSeguro(supabase: Cliente, usuarioId: string): Promise<Consulta[]> {
  try {
    return await listarConsultas(supabase, usuarioId);
  } catch {
    return [];
  }
}

export async function listarVacunasSeguro(supabase: Cliente, usuarioId: string): Promise<Vacuna[]> {
  try {
    return await listarVacunas(supabase, usuarioId);
  } catch {
    return [];
  }
}
