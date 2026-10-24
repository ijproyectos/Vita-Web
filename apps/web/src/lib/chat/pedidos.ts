import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ejecutarTool, type ResultadoTool } from "@/lib/ai/tools";

// Reintentos sin duplicar escrituras (migración 030, `acciones_agente`).
// Cada mensaje del chat trae un `pedido_id`; antes de ejecutar una tool que
// ESCRIBE se reclama una fila (usuario, pedido, clave). Si ya existía, la
// acción ya se hizo en un intento anterior: se devuelve lo guardado.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el pedidoId del cliente; si falta o es inválido genera uno (clientes viejos). */
export function normalizarPedidoId(entrante: unknown): string {
  return typeof entrante === "string" && UUID_RE.test(entrante) ? entrante : crypto.randomUUID();
}

// Única fuente de verdad de qué tools escriben (verificado contra TOOLS).
const TOOLS_DE_ESCRITURA = new Set([
  "add_medication",
  "update_schedule",
  "delete_schedule",
  "mark_taken",
  "mark_all_taken",
  "add_appointment",
  "update_health_profile",
  "add_condition",
  "add_allergy",
]);

// Normaliza texto libre del modelo: minúsculas, sin tildes, espacios colapsados.
// "  Ibuprofeno  " y "ibuprofeno" dan lo mismo.
function norm(valor: unknown): string {
  if (valor === undefined || valor === null) return "";
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ÚNICO lugar donde se define la clave de dedupe de cada tool de escritura.
 * El input lo genera el modelo y en un reintento puede venir reformulado
 * (otra dosis escrita distinto, un motivo nuevo...), así que NO se usa el input
 * entero: solo los campos que identifican la acción, normalizados. Dos llamadas
 * con la misma identidad son "la misma acción" dentro del mismo pedido.
 * Se conserva el nombre de la tool en la clave.
 */
function claveSemantica(nombre: string, input: Record<string, unknown>): string {
  const dias = Array.isArray(input.recurring_days) ? input.recurring_days.map(norm).sort().join(",") : "";
  let campos: unknown[];
  switch (nombre) {
    case "add_medication":
      campos = [input.name, input.scheduled_time];
      break;
    case "update_schedule":
      campos = [input.medication_name, input.medication_time_hint, input.scheduled_time, input.time_of_day, dias];
      break;
    case "delete_schedule":
    case "mark_taken":
      campos = [input.medication_name, input.medication_time_hint];
      break;
    case "mark_all_taken":
      campos = [];
      break;
    case "add_appointment":
      campos = [input.date, input.time, input.specialty];
      break;
    case "update_health_profile":
      campos = [input.gender, input.blood_type, input.height_cm, input.weight_kg, input.health_insurance];
      break;
    case "add_condition":
      campos = [input.label];
      break;
    case "add_allergy":
      campos = [input.name];
      break;
    default:
      campos = [JSON.stringify(input)];
  }
  return `${nombre}:${campos.map(norm).join("|")}`;
}

// Un claim sin resultado más viejo que esto es de un intento que se cayó a
// mitad de camino: se descarta y se vuelve a ejecutar.
const TTL_CLAIM_SIN_RESULTADO_MS = 2 * 60 * 1000;

const MENSAJE_YA_PEDIDA =
  "Esta acción ya se había pedido en un intento anterior y puede estar hecha. No la repitas: verificá con las tools de lectura antes de volver a escribir.";

type Contexto = { supabase: SupabaseClient; usuarioId: string; pedidoId: string };

/**
 * Como `ejecutarTool`, pero las tools de escritura se reclaman antes de
 * ejecutarse. Cualquier falla de la contabilidad (tabla inexistente, RLS...)
 * degrada a ejecutar la tool como antes: el chat nunca se rompe por esto.
 */
export async function ejecutarToolIdempotente(
  nombre: string,
  input: Record<string, unknown>,
  ctx: Contexto
): Promise<ResultadoTool> {
  const { supabase, usuarioId, pedidoId } = ctx;
  if (!TOOLS_DE_ESCRITURA.has(nombre)) return ejecutarTool(nombre, input, { supabase, usuarioId });

  const clave = claveSemantica(nombre, input);
  const filtro = { usuario_id: usuarioId, pedido_id: pedidoId, clave };

  let reclamada = false;
  try {
    const { data, error } = await supabase
      .from("acciones_agente")
      .upsert(filtro, { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      // Ya reclamada en un intento anterior: no se vuelve a ejecutar.
      const { data: previa } = await supabase
        .from("acciones_agente")
        .select("resultado, created_at")
        .match(filtro)
        .maybeSingle();
      const r = previa?.resultado as ResultadoTool | null | undefined;
      if (r && typeof r.contenido === "string") return r;

      const edadMs = previa?.created_at ? Date.now() - new Date(previa.created_at as string).getTime() : 0;
      if (previa && !r && edadMs > TTL_CLAIM_SIN_RESULTADO_MS) {
        // Claim huérfano de un intento caído: se libera y se reclama de nuevo.
        await liberar(supabase, filtro);
        const { data: nueva, error: errNueva } = await supabase
          .from("acciones_agente")
          .upsert(filtro, { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();
        if (errNueva) throw errNueva;
        if (nueva) {
          reclamada = true;
        } else {
          return { contenido: MENSAJE_YA_PEDIDA };
        }
      } else {
        return { contenido: MENSAJE_YA_PEDIDA };
      }
    } else {
      reclamada = true;
    }
  } catch {
    // Sin la tabla (migración pendiente) o ante cualquier otro error: se ejecuta como siempre.
    return ejecutarTool(nombre, input, { supabase, usuarioId });
  }

  let resultado: ResultadoTool;
  try {
    resultado = await ejecutarTool(nombre, input, { supabase, usuarioId });
  } catch (e) {
    if (reclamada) await liberar(supabase, filtro);
    throw e;
  }

  // Sin accionUI no se escribió nada (error de validación, "no encontré...").
  // Se libera el claim para que un reintento pueda volver a intentarlo.
  if (!resultado.accionUI) {
    await liberar(supabase, filtro);
    return resultado;
  }
  try {
    await supabase.from("acciones_agente").update({ resultado }).match(filtro);
  } catch {
    // Best-effort: el claim ya evita repetir la escritura.
  }
  return resultado;
}

async function liberar(supabase: SupabaseClient, filtro: Record<string, string>) {
  try {
    await supabase.from("acciones_agente").delete().match(filtro);
  } catch {
    // Best-effort.
  }
}

/**
 * En un reintento (mismo pedido) mira cómo quedó el primer intento:
 * - "respondido": el mensaje del usuario Y la respuesta de vita ya están
 *   guardados (el primer intento terminó); `respuesta` es el texto guardado.
 * - "guardado": solo el mensaje del usuario quedó como último: no se reinserta.
 * - "nuevo": no hay rastro del primer intento.
 */
export async function estadoDelReintento(
  supabase: SupabaseClient,
  usuarioId: string,
  sesionId: string,
  texto: string
): Promise<{ estado: "nuevo" | "guardado" | "respondido"; respuesta?: string }> {
  const { data } = await supabase
    .from("mensajes_chat")
    .select("role, contenido")
    .eq("usuario_id", usuarioId)
    .eq("sesion_id", sesionId)
    .order("created_at", { ascending: false })
    .limit(2);
  const [ultimo, anterior] = data ?? [];
  if (ultimo?.role === "assistant" && anterior?.role === "user" && anterior.contenido === texto) {
    return { estado: "respondido", respuesta: ultimo.contenido as string };
  }
  if (ultimo?.role === "user" && ultimo.contenido === texto) return { estado: "guardado" };
  return { estado: "nuevo" };
}
