import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMNAS_025, type CambiosPerfil, type Condicion, type MedicionesEnCasa, type Perfil, type UsoApp } from "./tipos";

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

/** True si el perfil no tiene remedios, condiciones ni alergias cargados. */
export async function perfilVacio(supabase: Cliente, usuarioId: string): Promise<boolean> {
  const { count, error } = await supabase.from("medicamentos").select("id", { count: "exact", head: true }).eq("usuario_id", usuarioId);
  if (error || (count ?? 0) > 0) return false;
  const perfil = await obtenerPerfil(supabase, usuarioId);
  return !perfil || ((perfil.condiciones?.length ?? 0) === 0 && (perfil.alergias?.length ?? 0) === 0);
}

/** Primer nombre de la persona ("Vos" si no hay). Nunca lanza. */
export async function obtenerNombre(supabase: Cliente, usuarioId: string): Promise<string> {
  const { data } = await supabase.from("perfiles").select("nombre").eq("id", usuarioId).maybeSingle();
  const nombre = (data?.nombre as string | null | undefined)?.trim();
  return nombre ? nombre.split(/\s+/)[0] : "Vos";
}

// Postgres 42703 / PostgREST PGRST204: la columna no existe (migración 025
// sin aplicar).
function faltaColumna(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}

class ErrorColumna extends Error {}

export async function actualizarPerfil(
  supabase: Cliente,
  usuarioId: string,
  cambios: CambiosPerfil
): Promise<Perfil> {
  try {
    return await escribirPerfil(supabase, usuarioId, cambios);
  } catch (e) {
    // Degradación: si todavía no existen las columnas de la 025 se reintenta
    // sin ellas, para que un campo faltante nunca tire todo el guardado.
    const sin = { ...cambios } as Record<string, unknown>;
    let quitoAlguna = false;
    for (const c of COLUMNAS_025) {
      if (c in sin) {
        delete sin[c];
        quitoAlguna = true;
      }
    }
    if (!quitoAlguna || !(e instanceof ErrorColumna)) throw e;
    return escribirPerfil(supabase, usuarioId, sin as CambiosPerfil);
  }
}

async function escribirPerfil(supabase: Cliente, usuarioId: string, cambios: CambiosPerfil): Promise<Perfil> {
  // update primero (sirve también para un cuidador 'editar', que no tiene
  // policy de INSERT y cuyo upsert fallaría); si no tocó ninguna fila, upsert
  // (ver el comentario en `actualizarPerfilCrudo`).
  const { data: actualizado, error: errorUpdate } = await supabase
    .from("perfiles")
    .update(cambios)
    .eq("id", usuarioId)
    .select()
    .maybeSingle();
  if (errorUpdate) {
    const Clase = faltaColumna(errorUpdate) ? ErrorColumna : Error;
    throw new Clase(`No se pudo actualizar el perfil: ${errorUpdate.message}`);
  }
  if (actualizado) return actualizado as Perfil;

  const { data, error } = await supabase
    .from("perfiles")
    .upsert({ id: usuarioId, ...cambios }, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    const Clase = faltaColumna(error) ? ErrorColumna : Error;
    throw new Clase(`No se pudo actualizar el perfil: ${error.message}`);
  }
  return data as Perfil;
}

export async function agregarCondicion(
  supabase: Cliente,
  usuarioId: string,
  condicion: Condicion
): Promise<Condicion[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const actuales = perfil?.condiciones ?? [];
  // Idempotente: una condición con el mismo nombre no se duplica.
  if (actuales.some((c) => c.label.trim().toLowerCase() === condicion.label.trim().toLowerCase())) return actuales;
  const condiciones = [...actuales, condicion];
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

/** Cambia una condición existente (identificada por su label actual). */
export async function actualizarCondicion(
  supabase: Cliente,
  usuarioId: string,
  labelActual: string,
  cambios: Partial<Condicion>
): Promise<Condicion[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const actuales = perfil?.condiciones ?? [];
  if (!actuales.some((c) => c.label === labelActual)) throw new Error("No encontramos esa condición.");
  const condiciones = actuales.map((c) => (c.label === labelActual ? limpiarCondicion({ ...c, ...cambios }) : c));
  await actualizarPerfilCrudo(supabase, usuarioId, { condiciones });
  return condiciones;
}

function limpiarCondicion(c: Condicion): Condicion {
  const { detalle, ...resto } = c;
  return detalle?.trim() ? { ...resto, detalle: detalle.trim() } : resto;
}

/** Renombra una alergia existente. */
export async function actualizarAlergia(
  supabase: Cliente,
  usuarioId: string,
  alergiaActual: string,
  nueva: string
): Promise<string[]> {
  const perfil = await obtenerPerfil(supabase, usuarioId);
  const actuales = perfil?.alergias ?? [];
  if (!actuales.includes(alergiaActual)) throw new Error("No encontramos esa alergia.");
  const alergias = actuales.map((a) => (a === alergiaActual ? nueva : a));
  await actualizarPerfilCrudo(supabase, usuarioId, { alergias });
  return alergias;
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
 * Guarda "¿te medís la presión o el azúcar en casa?" (031). Si la columna
 * todavía no existe (migración sin aplicar) no hace nada y no tira: es un dato
 * del onboarding, nunca debe cortar el recorrido.
 */
export async function guardarMedicionesEnCasa(supabase: Cliente, usuarioId: string, valor: MedicionesEnCasa): Promise<void> {
  try {
    await escribirPerfil(supabase, usuarioId, { mediciones_en_casa: valor });
  } catch (e) {
    if (e instanceof ErrorColumna) return;
    throw e;
  }
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
