"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import type { CambiosPerfil } from "@/lib/perfil/tipos";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";

// Resultado — nunca lanza (mismo criterio que el resto del repo,
// EstadoAccion en rutina/actions.ts).
export type ResultadoEdicion = { ok: true } | { ok: false; message: string };

// Familia (021): se edita el PERFIL ACTIVO (propio o de alguien que cuido con
// permiso "editar"). requireUser y la resolución del perfil van FUERA del try:
// requireUser redirige con una excepción que el catch no debe tragarse.
async function destinoEditable(): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return destino;
  return { ok: true, id: destino.perfil.id };
}

// Todo el form de "Datos personales"/"Medidas"/"Cobertura médica"/
// "Contacto de emergencia" se guarda de una — reemplaza el guardado
// campo-por-campo del pase anterior (hallazgo del usuario: "un guardar
// general y no uno por uno"). Condiciones/alergias no entran acá — son
// acciones de lista inmediatas, no campos de este form (ver
// agregar/quitarCondicion/Alergia más abajo, sin cambios).
export type DatosPerfilCompleto = {
  nombre: string;
  fechaNacimiento: string;
  genero: string;
  grupoSanguineo: string;
  alturaCm: string;
  pesoKg: string;
  obraSocial: string;
  numeroAfiliado: string;
  contactoEmergenciaNombre: string;
  contactoEmergenciaTelefono: string;
};

function numeroOnull(valor: string): number | null {
  const n = Number(valor.replace(",", "."));
  return valor.trim() && !isNaN(n) ? n : null;
}

export async function actualizarPerfilCompletoAction(datos: DatosPerfilCompleto): Promise<ResultadoEdicion> {
  const destino = await destinoEditable();
  if (!destino.ok) return destino;
  try {
    const supabase = await createClient();

    const cambios: CambiosPerfil = {
      nombre: datos.nombre.trim() || null,
      fecha_nacimiento: datos.fechaNacimiento.trim() || null,
      genero: datos.genero.trim() || null,
      grupo_sanguineo: datos.grupoSanguineo.trim() || null,
      altura_cm: numeroOnull(datos.alturaCm),
      peso_kg: numeroOnull(datos.pesoKg),
      obra_social: datos.obraSocial.trim() || null,
      numero_afiliado: datos.numeroAfiliado.trim() || null,
      contacto_emergencia_nombre: datos.contactoEmergenciaNombre.trim() || null,
      contacto_emergencia_telefono: datos.contactoEmergenciaTelefono.trim() || null,
    };

    await perfilNucleo.actualizarPerfil(supabase, destino.id, cambios);
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
  const destino = await destinoEditable();
  if (!destino.ok) return destino;
  try {
    const supabase = await createClient();
    await perfilNucleo.agregarCondicion(supabase, destino.id, { label, tipo, desde });
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo agregar la condición." };
  }
}

export async function quitarCondicionAction(label: string): Promise<ResultadoEdicion> {
  const destino = await destinoEditable();
  if (!destino.ok) return destino;
  try {
    const supabase = await createClient();
    await perfilNucleo.quitarCondicion(supabase, destino.id, label);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo quitar la condición." };
  }
}

export async function agregarAlergiaAction(alergia: string): Promise<ResultadoEdicion> {
  const destino = await destinoEditable();
  if (!destino.ok) return destino;
  try {
    const supabase = await createClient();
    await perfilNucleo.agregarAlergia(supabase, destino.id, alergia);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo agregar la alergia." };
  }
}

export async function quitarAlergiaAction(alergia: string): Promise<ResultadoEdicion> {
  const destino = await destinoEditable();
  if (!destino.ok) return destino;
  try {
    const supabase = await createClient();
    await perfilNucleo.quitarAlergia(supabase, destino.id, alergia);
    revalidatePath("/app/resumen-salud");
    revalidatePath("/app");
    revalidatePath("/app/mi-salud");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo quitar la alergia." };
  }
}
