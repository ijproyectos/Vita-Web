"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";
import type { EstadoAccion } from "../../rutina/actions";

// Las Server Actions nunca lanzan: devuelven {status, message?}.
// requireUser/perfilActivoEditable van fuera del try (pueden redirigir).

export async function crearMedicionAction(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };

  // El navegador manda fecha y hora de pared; son hora de Argentina (UTC-3, sin DST).
  const fecha = String(formData.get("fecha") ?? "").trim();
  const hora = String(formData.get("hora") ?? "").trim();
  const medidoAt = fecha && hora ? `${fecha}T${hora}:00-03:00` : null;
  if ((fecha && !hora) || (!fecha && hora)) {
    return { status: "error", message: "Para cambiar cuándo la mediste, completá la fecha y la hora." };
  }

  try {
    const supabase = await createClient();
    await medicionesNucleo.agregar(supabase, destino.perfil.id, {
      tipo: formData.get("tipo"),
      valor: formData.get("valor"),
      valorSecundario: formData.get("valorSecundario"),
      pulso: formData.get("pulso"),
      contexto: formData.get("contexto"),
      medidoAt,
      notas: formData.get("notas"),
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar la medición." };
  }

  revalidatePath("/app/mi-salud", "layout");
  return { status: "success" };
}

export async function eliminarMedicionAction(medicionId: string): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  try {
    const supabase = await createClient();
    await medicionesNucleo.eliminar(supabase, destino.perfil.id, medicionId);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo eliminar la medición." };
  }
  revalidatePath("/app/mi-salud", "layout");
  return { status: "success" };
}
