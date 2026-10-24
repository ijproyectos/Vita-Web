import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ejecutarTool, type ResultadoTool } from "@/lib/ai/tools";
import { mensajeFaltaConfirmacion, resolverDestino, TOOLS_DE_ESCRITURA } from "@/lib/ai/destino";
import type { MiembroFamilia } from "@/lib/familia/tipos";

// Reintentos sin duplicar escrituras (migración 030, `acciones_agente`).
// Cada mensaje del chat trae un `pedido_id`; antes de ejecutar una tool que
// ESCRIBE se reclama una fila (usuario, pedido, clave). Si ya existía, la
// acción ya se hizo en un intento anterior: se devuelve lo guardado.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el pedidoId del cliente; si falta o es inválido genera uno (clientes viejos). */
export function normalizarPedidoId(entrante: unknown): string {
  return typeof entrante === "string" && UUID_RE.test(entrante) ? entrante : crypto.randomUUID();
}

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

// Una confirmación pendiente (pregunta hecha al usuario) solo vale este rato.
const VENTANA_CONFIRMACION_MS = 10 * 60 * 1000;

type Contexto = {
  supabase: SupabaseClient;
  usuarioId: string;
  pedidoId: string;
  familia: MiembroFamilia[];
  /** Perfil de un familiar abierto en pantalla (ya validado), si lo hay. */
  abiertoId?: string;
};

/** true solo si el error es CLARAMENTE "la tabla acciones_agente no existe" (migración 030 sin aplicar). */
function esTablaInexistente(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  if (code === "PGRST205" || code === "42P01") return true;
  return typeof message === "string" && /does not exist|could not find the table/i.test(message);
}

const MENSAJE_CONFIRMACION_NO_VERIFICADA =
  "No pude verificar la confirmación del usuario (error temporal), así que NO se ejecutó nada. Decile al usuario que lo intente de nuevo en un momento.";

/**
 * Confirmación del usuario para escribir en OTRA persona, hecha cumplir por el
 * servidor (el flag `confirmado` del modelo no alcanza). Sin confirmación válida
 * se deja una fila pendiente (clave `pendiente:<clave>`, bajo el pedido ACTUAL) y
 * se devuelve "pendiente". Solo se ejecuta si existe una pendiente con la MISMA
 * clave de un pedido ANTERIOR (otro mensaje del usuario) de menos de 10 minutos,
 * que se consume al confirmar. Dentro del mismo pedido no se confirma, salvo por
 * el marcador `confirmada:<clave>` (bajo el pedido actual) que deja esta función
 * al consumir: si el primer intento se cayó tras consumir, el reintento del mismo
 * pedido lo encuentra y puede ejecutar.
 * "sin_tabla": la tabla no existe (migración 030 pendiente): se usa el flag del modelo.
 * "error": cualquier otro error de la contabilidad: se falla cerrado (no se ejecuta).
 */
async function confirmacionDelServidor(
  supabase: SupabaseClient,
  usuarioId: string,
  pedidoId: string,
  clave: string
): Promise<"confirmada" | "pendiente" | "sin_tabla" | "error"> {
  const clavePendiente = `pendiente:${clave}`;
  const claveConfirmada = `confirmada:${clave}`;
  try {
    const { data: marcador, error: errMarcador } = await supabase
      .from("acciones_agente")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("pedido_id", pedidoId)
      .eq("clave", claveConfirmada)
      .limit(1);
    if (errMarcador) throw errMarcador;
    if (marcador && marcador.length > 0) return "confirmada";

    const desde = new Date(Date.now() - VENTANA_CONFIRMACION_MS).toISOString();
    const { data: previas, error } = await supabase
      .from("acciones_agente")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("clave", clavePendiente)
      .neq("pedido_id", pedidoId)
      .gte("created_at", desde)
      .limit(1);
    if (error) throw error;
    const previa = previas?.[0];
    if (previa) {
      // Se consume: solo confirma quien efectivamente borró la fila.
      const { data: borradas, error: errBorrar } = await supabase
        .from("acciones_agente")
        .delete()
        .eq("id", previa.id)
        .select("id");
      if (errBorrar) throw errBorrar;
      if (borradas && borradas.length > 0) {
        // Marcador de consumo (best-effort): permite reintentar este mismo pedido.
        await supabase
          .from("acciones_agente")
          .upsert(
            { usuario_id: usuarioId, pedido_id: pedidoId, clave: claveConfirmada },
            { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true }
          );
        return "confirmada";
      }
    }
    const { error: errInsert } = await supabase
      .from("acciones_agente")
      .upsert(
        { usuario_id: usuarioId, pedido_id: pedidoId, clave: clavePendiente },
        { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true }
      );
    if (errInsert) throw errInsert;
    return "pendiente";
  } catch (e) {
    return esTablaInexistente(e) ? "sin_tabla" : "error";
  }
}

/**
 * Mira si esta misma acción (usuario, pedido, clave) ya fue reclamada, ANTES de
 * pedir confirmación: un reintento de un pedido ya ejecutado devuelve lo guardado
 * (replay) en vez de volver a preguntar.
 */
async function claimExistente(
  supabase: SupabaseClient,
  filtro: { usuario_id: string; pedido_id: string; clave: string }
): Promise<ResultadoTool | "ninguno" | "error"> {
  try {
    const { data, error } = await supabase
      .from("acciones_agente")
      .select("resultado, created_at")
      .match(filtro)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "ninguno";
    const r = data.resultado as ResultadoTool | null | undefined;
    if (r && typeof r.contenido === "string") return r;
    const edadMs = data.created_at ? Date.now() - new Date(data.created_at as string).getTime() : 0;
    // Vencido (intento caído): se sigue el flujo normal, que lo libera y reclama de nuevo.
    return edadMs > TTL_CLAIM_SIN_RESULTADO_MS ? "ninguno" : { contenido: MENSAJE_YA_PEDIDA };
  } catch (e) {
    return esTablaInexistente(e) ? "ninguno" : "error";
  }
}

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
  const { supabase, usuarioId, pedidoId, familia, abiertoId } = ctx;
  const ctxTool = { supabase, usuarioId, familia, abiertoId };
  if (!TOOLS_DE_ESCRITURA.has(nombre)) return ejecutarTool(nombre, input, ctxTool);

  // Destino inválido, rol Lector o falta de confirmación: se devuelve el error
  // al modelo ANTES de reclamar nada (si no, un "falta confirmar" ocuparía la
  // clave y la llamada confirmada del mismo pedido quedaría como "ya pedida").
  const destino = resolverDestino(nombre, input, ctxTool);
  if (!destino.ok) return { contenido: destino.contenido };

  // El destino va en la clave: la misma acción para dos personas distintas en
  // un pedido son dos acciones. El claim sigue siendo del usuario logueado.
  const clave = `${destino.destinoId}~${claveSemantica(nombre, input)}`;

  const filtro = { usuario_id: usuarioId, pedido_id: pedidoId, clave };

  if (destino.requiereConfirmacion) {
    // Replay: si este pedido ya ejecutó (o está ejecutando) la acción, no se vuelve a preguntar.
    const existente = await claimExistente(supabase, filtro);
    if (existente === "error") return { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA };
    if (existente !== "ninguno") return existente;

    const estado = await confirmacionDelServidor(supabase, usuarioId, pedidoId, clave);
    if (estado === "error") return { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA };
    if (estado === "pendiente") return { contenido: mensajeFaltaConfirmacion(destino.persona ?? "esa persona") };
    // Sin la tabla (migración 030 sin aplicar) se cae al comportamiento previo:
    // vale el flag `confirmado` del modelo. Degradación deliberada SOLO ante tabla inexistente.
    if (estado === "sin_tabla" && input.confirmado !== true) {
      return { contenido: mensajeFaltaConfirmacion(destino.persona ?? "esa persona") };
    }
    // Confirmación válida: se ejecuta (ejecutarTool exige confirmado: true).
    input = { ...input, confirmado: true };
  }

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
  } catch (e) {
    // Escritura sobre OTRA persona: solo se degrada si la tabla no existe; ante
    // cualquier otro error se falla cerrado. Sobre uno mismo (contrato T4) se
    // ejecuta como siempre.
    if (destino.requiereConfirmacion && !esTablaInexistente(e)) {
      return { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA };
    }
    return ejecutarTool(nombre, input, ctxTool);
  }

  let resultado: ResultadoTool;
  try {
    resultado = await ejecutarTool(nombre, input, ctxTool);
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
