"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import type { CambiosPerfil } from "@/lib/perfil/tipos";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";

export type ResultadoEditarPerfil = { ok: true } | { ok: false; message: string };

export type DatosEditarPerfil = {
  nombre: string;
  /** undefined = la migración 025 no está aplicada: el campo ni se manda. */
  apellido?: string;
  telefono?: string;
  fechaNacimiento: string;
  genero: string;
  /** kg, con coma o punto. */
  peso: string;
  /** metros ("1,68"); si alguien escribe centímetros ("168") se entiende igual. */
  altura: string;
  grupoSanguineo: string;
  obraSocial: string;
  numeroAfiliado: string;
};

function decimalOnull(valor: string): number | null {
  const t = valor.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

// "Editar perfil" (V7): un solo "Guardar cambios". El contacto de emergencia
// tiene su propia pantalla; condiciones/alergias también. Nunca lanza.
export async function guardarPerfilAction(datos: DatosEditarPerfil): Promise<ResultadoEditarPerfil> {
  const destino = await perfilActivoEditable();
  if (!destino.ok) return destino;

  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const fechaNacimiento = t(datos?.fechaNacimiento, 10);
  if (fechaNacimiento && (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento) || Number.isNaN(Date.parse(fechaNacimiento)))) {
    return { ok: false, message: "Revisá la fecha de nacimiento." };
  }
  const peso = decimalOnull(t(datos?.peso, 10));
  const alturaIngresada = decimalOnull(t(datos?.altura, 10));
  if (Number.isNaN(peso) || (peso !== null && (peso < 1 || peso > 500))) return { ok: false, message: "Revisá el peso." };
  if (Number.isNaN(alturaIngresada)) return { ok: false, message: "Revisá la altura." };
  // 1,68 (metros) o 168 (centímetros) -> cm.
  const alturaCm = alturaIngresada === null ? null : alturaIngresada < 3 ? Math.round(alturaIngresada * 100) : Math.round(alturaIngresada);
  if (alturaCm !== null && (alturaCm < 30 || alturaCm > 260)) return { ok: false, message: "Revisá la altura (por ejemplo 1,68)." };

  try {
    const supabase = await createClient();
    const cambios: CambiosPerfil = {
      nombre: t(datos.nombre, 80) || null,
      fecha_nacimiento: fechaNacimiento || null,
      genero: t(datos.genero, 40) || null,
      grupo_sanguineo: t(datos.grupoSanguineo, 10) || null,
      altura_cm: alturaCm,
      peso_kg: peso,
      obra_social: t(datos.obraSocial, 80) || null,
      numero_afiliado: t(datos.numeroAfiliado, 40) || null,
    };
    if (datos.apellido !== undefined) cambios.apellido = t(datos.apellido, 80) || null;
    if (datos.telefono !== undefined) cambios.telefono = t(datos.telefono, 40) || null;

    await perfilNucleo.actualizarPerfil(supabase, destino.perfil.id, cambios);
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
