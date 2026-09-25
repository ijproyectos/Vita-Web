"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCuidador } from "@/lib/dal";
import * as medicamentosNucleo from "@/lib/medicamentos/nucleo";
import type { ConComida, MomentoDia } from "@/lib/medicamentos/tipos";

// Único punto de escritura real del cuidador sobre datos del elder (fuera
// de marcar tomas, que este dashboard tampoco expone) — se apoya
// enteramente en la policy `medicamentos_insert_cuidador`
// (010_onboarding_rol_y_vinculo_por_codigo.sql) y en la MISMA función de
// dominio que usa el propio elder (`agregarMultiMomento`), solo que acá
// `usuarioId` es el `elderId`, no `requireCuidador().userId` — nunca se
// reimplementa la creación.
export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function crearMedicamentoParaElderAction(
  elderId: string,
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const { elders } = await requireCuidador();
  if (!elders.some((e) => e.elderId === elderId)) {
    return { status: "error", message: "No tenés acceso a esta persona." };
  }

  const supabase = await createClient();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const dosis = String(formData.get("dosis") ?? "").trim();
  const unidad = String(formData.get("unidad") ?? "mg");
  const frecuencia = String(formData.get("frecuencia") ?? "");
  const MOMENTOS_VALIDOS: MomentoDia[] = ["mañana", "mediodia", "tarde", "noche"];
  const momentos = (formData.getAll("momentos") as string[]).filter((m): m is MomentoDia =>
    MOMENTOS_VALIDOS.includes(m as MomentoDia)
  );
  const conComida = String(formData.get("conComida") ?? "no-importa") as ConComida;
  const duracion = String(formData.get("duracion") ?? "");
  const notas = String(formData.get("notas") ?? "").trim();

  if (!nombre || !dosis || momentos.length === 0) {
    return { status: "error", message: "Nombre, dosis y al menos un momento del día son obligatorios." };
  }

  try {
    await medicamentosNucleo.agregarMultiMomento(supabase, elderId, {
      nombre,
      dosis,
      unidad,
      momentos,
      frecuencia: frecuencia || null,
      conComida,
      duracion: duracion || null,
      notas: notas || null,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  redirect(`/cuidar/${elderId}`);
}
