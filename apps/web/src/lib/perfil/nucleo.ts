import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CambiosPerfil, Condicion, Perfil, UsoApp } from "./tipos";

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
  // update primero (sirve también para un cuidador 'editar', que no tiene
  // policy de INSERT y cuyo upsert fallaría); si no tocó ninguna fila, upsert
  // (ver el comentario en `actualizarPerfilCrudo`).
  const { data: actualizado, error: errorUpdate } = await supabase
    .from("perfiles")
    .update(cambios)
    .eq("id", usuarioId)
    .select()
    .maybeSingle();
  if (errorUpdate) throw new Error(`No se pudo actualizar el perfil: ${errorUpdate.message}`);
  if (actualizado) return actualizado as Perfil;

  const { data, error } = await supabase
    .from("perfiles")
    .upsert({ id: usuarioId, ...cambios }, { onConflict: "id" })
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
 * Guarda la respuesta al paso "¿para quién vas a usar la app?"
 * (app/onboarding/para-quien/) — separada de `completarOnboarding` porque
 * se escribe un paso antes (todavía no hay nombre/edad/condiciones), y no
 * es un campo "editable inline desde Resumen de salud" (por eso tampoco
 * entra en `CambiosPerfil`).
 */
export async function guardarUsoApp(supabase: Cliente, usuarioId: string, usoApp: UsoApp): Promise<void> {
  await actualizarPerfilCrudo(supabase, usuarioId, { uso_app: usoApp });
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

// Escritura genérica sin el tipado estricto de CambiosPerfil — usada
// internamente para condiciones/alergias/onboarding, que tocan columnas
// fuera del subconjunto "editable inline" expuesto por CambiosPerfil.
//
// upsert y no update: la fila de `perfiles` solo se crea en el callback de
// Google (auth/callback). Si falta (sesión abierta de antes, o la fila se
// borró desde el panel), un update afecta 0 filas SIN error — el onboarding
// "guardaba" uso_app/onboarding_completado_at en el vacío y la persona
// quedaba en un loop en /onboarding/para-quien. Con upsert la fila se crea
// (policy perfiles_upsert_self) y solo se pisan las columnas enviadas.
async function actualizarPerfilCrudo(
  supabase: Cliente,
  usuarioId: string,
  cambios: Record<string, unknown>
): Promise<void> {
  // update primero: un cuidador 'editar' (021_familia.sql) puede actualizar el
  // perfil de la persona que cuida pero no insertarlo, y un upsert exige
  // ambas. Si el update no tocó ninguna fila (perfil propio sin fila), upsert.
  const { data: actualizadas, error: errorUpdate } = await supabase
    .from("perfiles")
    .update(cambios)
    .eq("id", usuarioId)
    .select("id");
  if (errorUpdate) throw new Error(`No se pudo actualizar el perfil: ${errorUpdate.message}`);
  if ((actualizadas?.length ?? 0) > 0) return;

  const { error } = await supabase.from("perfiles").upsert({ id: usuarioId, ...cambios }, { onConflict: "id" });
  if (error) throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
}
