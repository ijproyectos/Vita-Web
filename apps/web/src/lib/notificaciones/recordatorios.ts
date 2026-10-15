import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR, listarHoy } from "@/lib/medicamentos/nucleo";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "./push";
import { payloadRecordatorio } from "./mensajes";

type Cliente = SupabaseClient;

/** Máximo de un recordatorio por dosis cada este tiempo. */
export const MINUTOS_ENTRE_RECORDATORIOS = 15;

export type ResultadoRecordatorio =
  | { status: "enviado" }
  | { status: "repetido" }
  | { status: "sin-avisos" }
  | { status: "ya-tomada" }
  | { status: "error"; message: string };

/**
 * "Recordarle": un cuidador le manda un push al elder por una dosis
 * pendiente de hoy.
 *
 * Segundo uso sancionado del cliente admin (el primero es el cron): las
 * suscripciones push son owner-only por RLS, así que un cuidador no puede
 * leer las del elder con su sesión. El admin client se crea RECIÉN después
 * de que todos los chequeos con el cliente de SESIÓN (RLS) pasaron:
 *   1. el vínculo `aceptado` cuidador -> elder existe (lectura bajo RLS);
 *   2. la dosis es realmente del elder (`medicamentos_select_cuidador`);
 *   3. no se mandó otro recordatorio de esa dosis hace < 15 min;
 *   4. el insert en `recordatorios_dosis` pasó su policy (que re-valida
 *      vínculo y pertenencia de la dosis).
 * El admin client solo se usa para leer/enviar a las suscripciones de ESE
 * `elderId` ya validado — nunca para decidir autorización.
 *
 * Nunca lanza.
 */
export async function recordarDosisAlElder(
  supabase: Cliente,
  cuidadorId: string,
  elderId: string,
  medicamentoId: string
): Promise<ResultadoRecordatorio> {
  try {
    // 1. Vínculo aceptado (RLS: vinculos_select_cuidador).
    const { data: vinculo, error: errorVinculo } = await supabase
      .from("vinculos_cuidador")
      .select("id")
      .eq("cuidador_id", cuidadorId)
      .eq("elder_id", elderId)
      .eq("estado", "aceptado")
      .maybeSingle();
    if (errorVinculo) return { status: "error", message: "No pudimos verificar el vínculo." };
    if (!vinculo) return { status: "error", message: "No tenés acceso a esta persona." };

    // 2. La dosis es del elder y sigue pendiente hoy (RLS de cuidador).
    const hoy = await listarHoy(supabase, elderId);
    const dosis = hoy.find((m) => m.id === medicamentoId);
    if (!dosis) return { status: "error", message: "No encontramos esa dosis para hoy." };
    if (dosis.tomado) return { status: "ya-tomada" };

    // 3. Rate-limit por dosis.
    const fechaAR = fechaEnAR();
    const desde = new Date(Date.now() - MINUTOS_ENTRE_RECORDATORIOS * 60_000).toISOString();
    const { data: recientes, error: errorRecientes } = await supabase
      .from("recordatorios_dosis")
      .select("id")
      .eq("medicamento_id", medicamentoId)
      .eq("fecha", fechaAR)
      .gte("created_at", desde)
      .limit(1);
    if (errorRecientes) return { status: "error", message: "No pudimos enviar el recordatorio." };
    if ((recientes ?? []).length > 0) return { status: "repetido" };

    // 4. Registro (también alimenta el aviso dentro de la app del elder).
    const { error: errorInsert } = await supabase.from("recordatorios_dosis").insert({
      medicamento_id: medicamentoId,
      elder_id: elderId,
      cuidador_id: cuidadorId,
      fecha: fechaAR,
    });
    if (errorInsert) return { status: "error", message: "No pudimos enviar el recordatorio." };

    // Autorización ya resuelta: recién ahora se toca el cliente admin.
    const resultado = await enviarPush(
      createAdminClient(),
      elderId,
      payloadRecordatorio({
        medicamentoId,
        nombre: dosis.nombre,
        horaProgramada: dosis.hora_programada,
        fechaAR,
      })
    );

    return resultado.enviados > 0 ? { status: "enviado" } : { status: "sin-avisos" };
  } catch {
    return { status: "error", message: "No pudimos enviar el recordatorio." };
  }
}

export type RecordatorioPendiente = {
  medicamentoId: string;
  nombre: string;
  horaProgramada: string;
};

/**
 * Dosis de hoy del propio usuario que un cuidador le recordó y siguen sin
 * tomarse (el aviso dentro de la app). Lectura bajo RLS
 * (`recordatorios_dosis_select_elder`). Degrada a [] si algo falla.
 */
export async function listarRecordatoriosPendientes(
  supabase: Cliente,
  usuarioId: string,
  medsHoy: { id: string; nombre: string; hora_programada: string; tomado: boolean }[]
): Promise<RecordatorioPendiente[]> {
  const pendientes = medsHoy.filter((m) => !m.tomado);
  if (pendientes.length === 0) return [];

  const { data, error } = await supabase
    .from("recordatorios_dosis")
    .select("medicamento_id")
    .eq("elder_id", usuarioId)
    .eq("fecha", fechaEnAR())
    .in(
      "medicamento_id",
      pendientes.map((m) => m.id)
    );
  if (error || !data) return [];

  const ids = new Set((data as { medicamento_id: string }[]).map((r) => r.medicamento_id));
  return pendientes
    .filter((m) => ids.has(m.id))
    .map((m) => ({ medicamentoId: m.id, nombre: m.nombre, horaProgramada: m.hora_programada }));
}
