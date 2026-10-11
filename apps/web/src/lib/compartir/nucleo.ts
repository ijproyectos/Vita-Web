import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DURACIONES,
  ETIQUETA_MAX,
  type DuracionEnlace,
  type EnlaceCreado,
  type EnlaceProfesional,
  type EstadoEnlace,
  type ResumenProfesional,
} from "./tipos";

// Núcleo de "Compartir con profesional". El token crudo (32 bytes,
// base64url) se genera acá, se devuelve UNA vez a quien llama y jamás se
// guarda ni se loguea: la DB solo conoce su sha256 en hex. La lectura
// pública va por la RPC `resumen_profesional` (security definer).
type Cliente = SupabaseClient;

const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

export function hashearToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function crearEnlace(
  supabase: Cliente,
  usuarioId: string,
  datos: { etiqueta?: string | null; duracion: DuracionEnlace }
): Promise<EnlaceCreado> {
  const duracion = DURACIONES.find((d) => d.valor === datos.duracion);
  if (!duracion) throw new Error("Duración inválida.");

  const etiqueta = datos.etiqueta?.trim().slice(0, ETIQUETA_MAX) || null;
  const token = randomBytes(32).toString("base64url");
  const expiraAt = new Date(new Date().getTime() + duracion.horas * 3600 * 1000).toISOString();

  const { error } = await supabase.from("enlaces_profesional").insert({
    usuario_id: usuarioId,
    token_hash: hashearToken(token),
    etiqueta,
    expira_at: expiraAt,
  });
  if (error) throw new Error("No se pudo crear el link.");

  return { token, expira_at: expiraAt };
}

function estadoDe(f: { expira_at: string; revocado_at: string | null }, ahora: Date): EstadoEnlace {
  if (f.revocado_at) return "revocado";
  return new Date(f.expira_at) > ahora ? "activo" : "vencido";
}

const ORDEN: Record<EstadoEnlace, number> = { activo: 0, vencido: 1, revocado: 2 };

/** Activos primero (el que vence más tarde arriba), después vencidos y revocados por fecha de creación. */
export async function listarEnlaces(supabase: Cliente, usuarioId: string): Promise<EnlaceProfesional[]> {
  const { data, error } = await supabase
    .from("enlaces_profesional")
    .select("id, etiqueta, expira_at, revocado_at, created_at, ultimo_acceso_at, accesos")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("No se pudieron cargar tus links.");

  const ahora = new Date();
  return (data ?? [])
    .map((f) => ({ ...f, estado: estadoDe(f, ahora) }) as EnlaceProfesional)
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]);
}

export async function revocarEnlace(supabase: Cliente, usuarioId: string, enlaceId: string): Promise<void> {
  const { error } = await supabase
    .from("enlaces_profesional")
    .update({ revocado_at: new Date().toISOString() })
    .eq("id", enlaceId)
    .eq("usuario_id", usuarioId)
    .is("revocado_at", null);
  if (error) throw new Error("No se pudo revocar el link.");
}

/**
 * Lectura pública del resumen. null = link inexistente, vencido, revocado o
 * error: el llamador no distingue (y la RPC tampoco).
 */
export async function obtenerResumenPublico(supabase: Cliente, token: string): Promise<ResumenProfesional | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data, error } = await supabase.rpc("resumen_profesional", { p_token: token });
  if (error || !data) return null;
  return data as ResumenProfesional;
}
