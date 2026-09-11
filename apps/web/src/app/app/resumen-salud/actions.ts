"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import type { CambiosPerfil } from "@/lib/perfil/tipos";

// Campos editables inline (patrón EditRow del diseño) — whitelist explícita,
// nunca un update dinámico desde una clave arbitraria del form (mismo
// criterio que NutrIA para las RPCs de perfil).
const CAMPOS_TEXTO = [
  "nombre",
  "genero",
  "grupo_sanguineo",
  "obra_social",
  "numero_afiliado",
  "contacto_emergencia_nombre",
  "contacto_emergencia_telefono",
] as const;
const CAMPOS_NUMERO = ["altura_cm", "peso_kg"] as const;
const CAMPOS_FECHA = ["fecha_nacimiento"] as const;

type CampoEditable =
  | (typeof CAMPOS_TEXTO)[number]
  | (typeof CAMPOS_NUMERO)[number]
  | (typeof CAMPOS_FECHA)[number];

// Resultado — nunca lanza (mismo criterio que el resto del repo,
// EstadoAccion en rutina/actions.ts): resumen-salud-view.tsx cierra el
// editor inline apenas dispara la transition, así que si la action tirara
// una excepción sin capturar, el campo se vería "guardado" con el valor
// viejo aunque el update haya fallado, sin ningún aviso al usuario.
export type ResultadoEdicion = { ok: true } | { ok: false; message: string };

export async function actualizarCampoAction(campo: CampoEditable, valor: string): Promise<ResultadoEdicion> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();

    const cambios: CambiosPerfil = {};
    if ((CAMPOS_TEXTO as readonly string[]).includes(campo)) {
      (cambios as Record<string, unknown>)[campo] = valor.trim() || null;
    } else if ((CAMPOS_NUMERO as readonly string[]).includes(campo)) {
      const n = Number(valor.replace(",", "."));
      (cambios as Record<string, unknown>)[campo] = valor.trim() && !isNaN(n) ? n : null;
    } else if ((CAMPOS_FECHA as readonly string[]).includes(campo)) {
      (cambios as Record<string, unknown>)[campo] = valor.trim() || null;
    } else {
      return { ok: false, message: `Campo no editable: ${campo}` };
    }

    await perfilNucleo.actualizarPerfil(supabase, usuario.id, cambios);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export async function agregarCondicionAction(
  label: string,
  tipo: "permanente" | "temporal",
  desde: string
): Promise<ResultadoEdicion> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();
    await perfilNucleo.agregarCondicion(supabase, usuario.id, { label, tipo, desde });
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo agregar la condición." };
  }
}

export async function quitarCondicionAction(label: string): Promise<ResultadoEdicion> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();
    await perfilNucleo.quitarCondicion(supabase, usuario.id, label);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo quitar la condición." };
  }
}

export async function agregarAlergiaAction(alergia: string): Promise<ResultadoEdicion> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();
    await perfilNucleo.agregarAlergia(supabase, usuario.id, alergia);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo agregar la alergia." };
  }
}

export async function quitarAlergiaAction(alergia: string): Promise<ResultadoEdicion> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();
    await perfilNucleo.quitarAlergia(supabase, usuario.id, alergia);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo quitar la alergia." };
  }
}
