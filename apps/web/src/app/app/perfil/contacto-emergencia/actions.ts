"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";

export type ResultadoContacto = { ok: true } | { ok: false; message: string };

export type DatosContacto = { nombre: string; relacion: string; telefono: string };

// Contacto de emergencia (V7): nombre, "Es tu…" y teléfono. Es el mismo
// contacto que usa el botón Ayuda del modo simple (`tel:`). Nunca lanza.
export async function guardarContactoEmergenciaAction(datos: DatosContacto): Promise<ResultadoContacto> {
  const destino = await perfilActivoEditable();
  if (!destino.ok) return destino;

  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const nombre = t(datos?.nombre, 120);
  const telefono = t(datos?.telefono, 40);
  const relacion = t(datos?.relacion, 40);
  const vacio = !nombre && !telefono;
  if (!vacio && (!nombre || !telefono)) return { ok: false, message: "Completá nombre y teléfono." };
  if (telefono && telefono.replace(/\D/g, "").length < 6) {
    return { ok: false, message: "Revisá el teléfono: parece incompleto." };
  }

  try {
    const supabase = await createClient();
    await perfilNucleo.actualizarPerfil(supabase, destino.perfil.id, {
      contacto_emergencia_nombre: nombre || null,
      contacto_emergencia_telefono: telefono || null,
      // Si la migración 025 no está aplicada, actualizarPerfil la omite sola.
      contacto_emergencia_relacion: vacio ? null : relacion || null,
    });
    revalidatePath("/app/perfil");
    revalidatePath("/app/modo-simple");
    revalidatePath("/app/resumen-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
