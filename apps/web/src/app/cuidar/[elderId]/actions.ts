"use server";

import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCuidador, requireUser } from "@/lib/dal";
import { recordarDosisAlElder, type ResultadoRecordatorio } from "@/lib/notificaciones/recordatorios";
import { listarElders } from "@/lib/cuidadores/nucleo";
import { generarCodigoAcceso } from "@/lib/acceso-codigo/nucleo";
import type { ResultadoCodigoAcceso } from "@/lib/acceso-codigo/tipos";
import { MENSAJE_SOLO_LECTURA, rolSobre } from "@/lib/familia/perfil-activo";
import * as medicamentosNucleo from "@/lib/medicamentos/nucleo";
import type { EstadoAccion } from "@/app/app/rutina/actions";
import { ErrorEntradaMedicamento, ErrorHorarioMedicamentoDuplicado, mensajeSeguroMedicamento } from "@/lib/medicamentos/duplicados";
import { leerTomas } from "@/lib/medicamentos/formulario";

// Único punto de escritura real del cuidador sobre datos del elder (fuera
// de marcar tomas, que este dashboard tampoco expone) — se apoya
// enteramente en la policy `medicamentos_insert_cuidador`
// (010_onboarding_rol_y_vinculo_por_codigo.sql) y en la MISMA función de
// dominio que usa el propio elder (`agregarMultiMomento`), solo que acá
// `usuarioId` es el `elderId`, no `requireCuidador().userId` — nunca se
// reimplementa la creación.
export async function crearMedicamentoParaElderAction(
  elderId: string,
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const { elders } = await requireCuidador();
  if (!elders.some((e) => e.elderId === elderId)) {
    return { status: "error", message: "No tenés acceso a esta persona." };
  }
  // 021: crear medicamentos exige permiso "editar" (la RLS lo hace cumplir).
  if ((await rolSobre(elderId)) !== "editar") {
    return { status: "error", message: MENSAJE_SOLO_LECTURA };
  }

  const supabase = await createClient();

  const nombre = String(formData.get("nombre") ?? "").trim().slice(0, 120);
  const dosis = String(formData.get("dosis") ?? "").trim().slice(0, 40);
  const unidad = String(formData.get("unidad") ?? "mg");
  const frecuencia = String(formData.get("frecuencia") ?? "");
  let tomas: ReturnType<typeof leerTomas>;
  try {
    tomas = leerTomas(formData);
  } catch (e) {
    return { status: "error", message: mensajeSeguroMedicamento(e, "Revisá los horarios.") };
  }
  const duracion = String(formData.get("duracion") ?? "");
  const notas = String(formData.get("notas") ?? "").trim().slice(0, 500);

  if (!nombre || tomas.length === 0) {
    return { status: "error", message: "El nombre y al menos un horario son obligatorios." };
  }

  try {
    await medicamentosNucleo.agregarMultiMomento(supabase, elderId, {
      nombre,
      dosis: dosis || null,
      unidad,
      tomas,
      frecuencia: frecuencia || null,
      duracion: duracion || null,
      notas: notas || null,
    });
  } catch (e) {
    // Los errores de dominio (horario repetido, hora inválida) se muestran tal cual.
    if (e instanceof ErrorHorarioMedicamentoDuplicado || e instanceof ErrorEntradaMedicamento) {
      return { status: "error", message: e.message };
    }
    console.error("crearMedicamentoParaElderAction", e);
    return { status: "error", message: "No pudimos guardar el medicamento. Probá de nuevo." };
  }

  // redirect() lanza NEXT_REDIRECT a propósito: excepción deliberada de Next.js,
  // por eso queda fuera de cualquier try/catch.
  redirect(`/cuidar/${elderId}`, RedirectType.replace);
}

/**
 * "Recordarle": push al elder por una dosis pendiente de hoy. Toda la
 * autorización (vínculo aceptado, dosis del elder, rate-limit) la resuelve
 * `recordarDosisAlElder` con el cliente de SESIÓN antes de tocar el admin
 * client. Nunca lanza; `requireUser` queda fuera del try porque redirige.
 */
export async function recordarleAction(elderId: string, medicamentoId: string): Promise<ResultadoRecordatorio> {
  const usuario = await requireUser();
  if (typeof elderId !== "string" || typeof medicamentoId !== "string") {
    return { status: "error", message: "Datos inválidos." };
  }
  try {
    const supabase = await createClient();
    return await recordarDosisAlElder(supabase, usuario.id, elderId, medicamentoId);
  } catch {
    return { status: "error", message: "No pudimos mandar el recordatorio. Probá de nuevo." };
  }
}

/**
 * "Código para que entre de nuevo": código de acceso de un solo uso (30 min)
 * para que la persona cuidada vuelva a entrar desde otro celular. La
 * autorización final la da la RLS de `codigos_acceso` (vínculo aceptado);
 * el chequeo previo es solo para devolver un mensaje claro. Nunca lanza;
 * `requireUser` queda fuera del try porque redirige.
 */
export async function generarCodigoAccesoAction(elderId: string): Promise<ResultadoCodigoAcceso> {
  const usuario = await requireUser();
  if (typeof elderId !== "string") return { status: "error", message: "Datos inválidos." };
  try {
    const supabase = await createClient();
    const elders = await listarElders(supabase, usuario.id);
    if (!elders.some((e) => e.elderId === elderId)) {
      return { status: "error", message: "No tenés acceso a esta persona." };
    }
    // 021: un código de acceso abre sesión COMO esa persona → exige "editar".
    if ((await rolSobre(elderId)) !== "editar") {
      return { status: "error", message: MENSAJE_SOLO_LECTURA };
    }
    return await generarCodigoAcceso(supabase, usuario.id, elderId);
  } catch {
    return { status: "error", message: "No pudimos generar el código. Probá de nuevo." };
  }
}
