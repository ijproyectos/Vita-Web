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

// JSON con claves ordenadas: el mismo input da siempre la misma clave.
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

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

  const clave = `${nombre}:${canonico(input)}`;
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
        .select("resultado")
        .match(filtro)
        .maybeSingle();
      const r = previa?.resultado as ResultadoTool | null | undefined;
      if (r && typeof r.contenido === "string") return r;
      return {
        contenido:
          "Esta acción ya se había pedido en un intento anterior y puede estar hecha. No la repitas: verificá con las tools de lectura antes de volver a escribir.",
      };
    }
    reclamada = true;
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
 * En un reintento (mismo pedido) el mensaje del usuario ya quedó guardado si
 * el primer intento llegó a persistirlo: no se inserta dos veces.
 */
export async function yaGuardadoComoUltimoMensaje(
  supabase: SupabaseClient,
  usuarioId: string,
  sesionId: string,
  texto: string
): Promise<boolean> {
  const { data } = await supabase
    .from("mensajes_chat")
    .select("role, contenido")
    .eq("usuario_id", usuarioId)
    .eq("sesion_id", sesionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.role === "user" && data.contenido === texto;
}
