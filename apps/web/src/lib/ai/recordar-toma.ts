import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { horaEnAR, fechaEnAR, idsOmitidas, listarHoy } from "@/lib/medicamentos/nucleo";
import { resumenHoy } from "@/lib/familia/pendientes-hoy";
import { recordarDosisAlElder } from "@/lib/notificaciones/recordatorios";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import type { ResultadoTool } from "./tools";
import {
  leerIdsDosis,
  MAX_DOSIS_POR_RECORDATORIO,
  resumirRecordatorios,
  textoPropuestaRecordatorio,
  TEXTO_NADA_PENDIENTE_RECORDAR,
  TEXTO_SIN_CELULAR_RECORDAR,
  TEXTO_SOLO_OTRAS_PERSONAS,
  type DosisPendienteChat,
} from "./recordar-toma-logica";

type Cliente = SupabaseClient;

/** Dosis de hoy sin tomar, ya vencidas y sin "No la tomé": MISMO criterio que la lista "Hoy" con el botón Recordarle. */
async function dosisPendientes(supabase: Cliente, personaId: string): Promise<DosisPendienteChat[]> {
  const hoy = await listarHoy(supabase, personaId);
  const omitidas = await idsOmitidas(supabase, hoy.map((m) => m.id), fechaEnAR());
  const { pendientes } = resumenHoy(hoy, horaEnAR(), omitidas);
  const porId = new Map(hoy.map((m) => [m.id, m]));
  return pendientes.flatMap((p) => {
    const m = porId.get(p.id);
    return m ? [{ id: m.id, nombre: m.nombre, hora: m.hora_programada }] : [];
  });
}

/**
 * Antes de pedir la confirmación: deja `medication_ids` EXACTOS (las dosis pendientes reales de la persona) en el
 * input, así la acción pendiente queda atada a esas dosis. Nunca lanza.
 */
export async function prepararRecordatorio(
  supabase: Cliente,
  usuarioId: string,
  destino: { destinoId: string; persona: string | null },
  input: Record<string, unknown>
): Promise<{ ok: true; input: Record<string, unknown>; texto: string } | { ok: false; resultado: ResultadoTool }> {
  if (destino.destinoId === usuarioId || !destino.persona) return { ok: false, resultado: { contenido: TEXTO_SOLO_OTRAS_PERSONAS } };
  const pedidas = leerIdsDosis(input.medication_ids);
  if (pedidas === "invalido") {
    return { ok: false, resultado: { contenido: "medication_ids tiene que ser una lista de ids de list_today_medications (o no pasarlo para recordar todas las pendientes). No se mandó nada." } };
  }
  let pendientes: DosisPendienteChat[];
  try {
    pendientes = await dosisPendientes(supabase, destino.destinoId);
  } catch {
    return { ok: false, resultado: { contenido: "No pude leer las dosis de hoy ahora, así que no se mandó nada. Decile que lo intente en un momento o use el botón Recordarle de su ficha." } };
  }
  const elegidas = (pedidas ? pendientes.filter((d) => pedidas.includes(d.id)) : pendientes).slice(0, MAX_DOSIS_POR_RECORDATORIO);
  if (elegidas.length === 0) return { ok: false, resultado: { contenido: TEXTO_NADA_PENDIENTE_RECORDAR } };
  const ids = elegidas.map((d) => d.id).sort();
  return {
    ok: true,
    input: { ...input, medication_ids: ids },
    texto: textoPropuestaRecordatorio(destino.persona, elegidas),
  };
}

/**
 * Ejecuta lo CONFIRMADO. Cada dosis pasa por `recordarDosisAlElder` (vínculo aceptado, dosis del elder, límite de
 * 1 cada 15 min, insert bajo RLS y recién después el cliente admin): nada de la autorización se reimplementa acá.
 * Mismos cortes que el botón: sin celular conectado no se envía; "sin-avisos" o error cortan el resto.
 */
export async function ejecutarRecordarToma(
  supabase: Cliente,
  usuarioId: string,
  miembro: MiembroFamilia | undefined,
  input: Record<string, unknown>
): Promise<ResultadoTool> {
  if (!miembro || miembro.id === usuarioId) return { contenido: TEXTO_SOLO_OTRAS_PERSONAS };
  const persona = miembro.nombre;
  if (!miembro.conectado) {
    const texto = TEXTO_SIN_CELULAR_RECORDAR(persona);
    return { contenido: texto, textoUsuario: texto, codigo: "recordar_sin_celular" };
  }
  const pedidas = leerIdsDosis(input.medication_ids);
  if (pedidas === "invalido") return { contenido: "medication_ids inválido. No se mandó nada." };
  let dosis: DosisPendienteChat[];
  try {
    dosis = await dosisPendientes(supabase, miembro.id);
  } catch {
    return { contenido: "No pude leer las dosis de hoy ahora, así que no se mandó nada." };
  }
  const nombres = new Map(dosis.map((d) => [d.id, d.nombre]));
  // Solo ids que SIGUEN pendientes de esa persona (si el modelo no pasó ids, todas las pendientes).
  const ids = (pedidas ?? dosis.map((d) => d.id)).filter((id) => nombres.has(id)).slice(0, MAX_DOSIS_POR_RECORDATORIO);
  if (ids.length === 0) return { contenido: TEXTO_NADA_PENDIENTE_RECORDAR, textoUsuario: TEXTO_NADA_PENDIENTE_RECORDAR, codigo: "recordar_nada_pendiente" };

  const resultados: Parameters<typeof resumirRecordatorios>[1] = [];
  for (const id of ids) {
    const r = await recordarDosisAlElder(supabase, usuarioId, miembro.id, id);
    resultados.push({ nombre: nombres.get(id) ?? "", r });
    if (r.status === "sin-avisos" || r.status === "error") break;
  }
  const { texto, enviadas } = resumirRecordatorios(persona, resultados);
  return {
    contenido: texto,
    textoUsuario: texto,
    ...(enviadas > 0 ? { accionUI: { type: "reminder_sent", count: enviadas, persona } } : { codigo: "recordar_no_enviado" }),
  };
}
