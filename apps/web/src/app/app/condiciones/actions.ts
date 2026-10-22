"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { condicionDesdeDetalle } from "@/lib/perfil/tipos";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";
import type { EstadoAccion } from "../rutina/actions";

// Condiciones y alergias (V7): alta, edición y baja sobre el PERFIL ACTIVO.
// Nunca lanzan; con permiso "ver" devuelven el mensaje de solo lectura.

type Tab = "cond" | "alergias";

function revalidar() {
  revalidatePath("/app/condiciones");
  revalidatePath("/app/resumen-salud");
  revalidatePath("/app/mi-salud");
  revalidatePath("/app/perfil");
  revalidatePath("/app");
}

async function ejecutar(trabajo: (id: string, supabase: Awaited<ReturnType<typeof createClient>>) => Promise<string | null>, mensajeError: string): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  try {
    const supabase = await createClient();
    const problema = await trabajo(destino.perfil.id, supabase);
    if (problema) return { status: "error", message: problema };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : mensajeError };
  }
  revalidar();
  return { status: "success" };
}

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function agregarItemAction(tab: Tab, texto: string): Promise<EstadoAccion> {
  const t = texto.trim().slice(0, 80);
  if (!t) return { status: "error", message: "Escribí qué querés agregar." };
  return ejecutar(async (id, supabase) => {
    const perfil = await perfilNucleo.obtenerPerfil(supabase, id);
    if (tab === "cond") {
      if (perfil?.condiciones.some((c) => igual(c.label, t))) return "Esa condición ya está en la lista.";
      await perfilNucleo.agregarCondicion(supabase, id, { label: t, tipo: "permanente", desde: "" });
    } else {
      if (perfil?.alergias.some((a) => igual(a, t))) return "Esa alergia ya está en la lista.";
      await perfilNucleo.agregarAlergia(supabase, id, t);
    }
    return null;
  }, "No se pudo agregar.");
}

export async function editarCondicionAction(labelActual: string, label: string, detalle: string): Promise<EstadoAccion> {
  const nuevo = label.trim().slice(0, 80);
  if (!nuevo) return { status: "error", message: "El nombre no puede quedar vacío." };
  return ejecutar(async (id, supabase) => {
    const perfil = await perfilNucleo.obtenerPerfil(supabase, id);
    const actual = perfil?.condiciones.find((c) => c.label === labelActual);
    if (!actual) return "No encontramos esa condición.";
    if (!igual(nuevo, labelActual) && perfil?.condiciones.some((c) => igual(c.label, nuevo))) {
      return "Ya hay una condición con ese nombre.";
    }
    const cambios = detalle.trim() ? condicionDesdeDetalle(detalle, actual) : {};
    await perfilNucleo.actualizarCondicion(supabase, id, labelActual, { label: nuevo, ...cambios });
    return null;
  }, "No se pudo guardar la condición.");
}

export async function editarAlergiaAction(actual: string, nueva: string): Promise<EstadoAccion> {
  const n = nueva.trim().slice(0, 80);
  if (!n) return { status: "error", message: "El nombre no puede quedar vacío." };
  return ejecutar(async (id, supabase) => {
    const perfil = await perfilNucleo.obtenerPerfil(supabase, id);
    if (!igual(n, actual) && perfil?.alergias.some((a) => igual(a, n))) return "Ya hay una alergia con ese nombre.";
    await perfilNucleo.actualizarAlergia(supabase, id, actual, n);
    return null;
  }, "No se pudo guardar la alergia.");
}

export async function quitarItemAction(tab: Tab, texto: string): Promise<EstadoAccion> {
  return ejecutar(async (id, supabase) => {
    if (tab === "cond") await perfilNucleo.quitarCondicion(supabase, id, texto);
    else await perfilNucleo.quitarAlergia(supabase, id, texto);
    return null;
  }, "No se pudo quitar.");
}
