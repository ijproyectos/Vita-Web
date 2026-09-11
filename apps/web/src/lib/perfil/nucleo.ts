import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CambiosPerfil, Condicion, Perfil } from "./tipos";

type Cliente = SupabaseClient;

export async function obtenerPerfil(supabase: Cliente, usuarioId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", usuarioId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  return data as Perfil | null;
}

export async function actualizarPerfil(
  supabase: Cliente,
  usuarioId: string,
  cambios: CambiosPerfil
): Promise<Perfil> {
  const { data, error } = await supabase
    .from("perfiles")
    .update(cambios)
    .eq("id", usuarioId)
    .select()
    .single();

  if (error) throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
  return data as Perfil;
}

export async function agregarCondicion(
  supabase: Cliente,
  usuarioId: string,
  condicion: Condicion
): Promise<Condicion[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const condiciones = [...(perfil?.condiciones ?? []), condicion];
  await actualizarPerfilCrudo(supabase, usuarioId, { condiciones });
  return condiciones;
}

export async function quitarCondicion(
  supabase: Cliente,
  usuarioId: string,
  label: string
): Promise<Condicion[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const condiciones = (perfil?.condiciones ?? []).filter((c) => c.label !== label);
  await actualizarPerfilCrudo(supabase, usuarioId, { condiciones });
  return condiciones;
}

export async function agregarAlergia(
  supabase: Cliente,
  usuarioId: string,
  alergia: string
): Promise<string[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const alergias = perfil?.alergias?.includes(alergia)
    ? perfil.alergias
    : [...(perfil?.alergias ?? []), alergia];
  await actualizarPerfilCrudo(supabase, usuarioId, { alergias });
  return alergias;
}

export async function quitarAlergia(
  supabase: Cliente,
  usuarioId: string,
  alergia: string
): Promise<string[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const alergias = (perfil?.alergias ?? []).filter((a) => a !== alergia);
  await actualizarPerfilCrudo(supabase, usuarioId, { alergias });
  return alergias;
}

/**
 * Completa la encuesta scripteada del onboarding (OnboardingChatScreen del
 * diseño) — guarda el nombre, la edad gruesa elegida por chip, y siembra
 * condiciones/alergias reales según lo respondido. No pasa por Anthropic,
 * es un guion fijo (mismo criterio que el diseño original).
 */
export async function completarOnboarding(
  supabase: Cliente,
  usuarioId: string,
  datos: {
    nombre?: string;
    edadRango?: string;
    condicionesSeed?: Condicion[];
    alergiasSeed?: string[];
  }
): Promise<void> {
  const cambios: Record<string, unknown> = { onboarding_completado_at: new Date().toISOString() };
  if (datos.nombre) cambios.nombre = datos.nombre;
  if (datos.edadRango) cambios.edad_rango = datos.edadRango;
  if (datos.condicionesSeed?.length) cambios.condiciones = datos.condicionesSeed;
  if (datos.alergiasSeed?.length) cambios.alergias = datos.alergiasSeed;

  await actualizarPerfilCrudo(supabase, usuarioId, cambios);
}

// Update genérico sin el tipado estricto de CambiosPerfil — usado
// internamente para condiciones/alergias/onboarding, que tocan columnas
// fuera del subconjunto "editable inline" expuesto por CambiosPerfil.
async function actualizarPerfilCrudo(
  supabase: Cliente,
  usuarioId: string,
  cambios: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("perfiles").update(cambios).eq("id", usuarioId);
  if (error) throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
}
