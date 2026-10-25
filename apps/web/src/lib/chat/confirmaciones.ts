import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { momentoDiaDesdeIngles, diasDesdeIngles } from "@/lib/ai/mapeo";
import { opcionesConfirmarAccion, type AccionOpciones } from "@/lib/ai/destino";
import type { AccionUI, ResultadoTool } from "@/lib/ai/tools";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import type { DatosActualizarHorario } from "@/lib/medicamentos/tipos";
import { momentoDelDia } from "@/lib/rutina/momento";
import {
  esAccionGuardada,
  esTablaInexistente,
  hhmm,
  pendienteVigente,
  resolverMedicamento,
  snapshotCoincide,
  textoExito,
  textoPropuesta,
  tomarSnapshot,
  VENTANA_ACCION_PENDIENTE_MS,
  type AccionGuardada,
  type SnapshotMedicamento,
} from "./confirmaciones-logica";

// Borrar o cambiar el horario de un medicamento NUNCA se ejecuta desde la tool:
// la tool resuelve la fila, guarda la acción exacta en `acciones_agente`
// (tipo 'confirmacion', una por usuario) y el usuario la confirma con un botón.
// Al confirmar el SERVIDOR ejecuta lo guardado por id, sin pasar por el modelo.
// Todo falla cerrado: ante cualquier error de la tabla no se ejecuta nada (no
// vale el flag `confirmado` del modelo, a diferencia de las altas a familiares).

const MENSAJE_NO_VERIFICADA =
  "No pude dejar la acción pendiente de confirmación (error temporal), así que NO se ejecutó nada. Decile al usuario que lo intente de nuevo en un momento.";

const TEXTO_NO_VERIFICADA = "No pude confirmarlo por un problema temporal, así que no cambié nada. Probá de nuevo en un momento.";
const TEXTO_NADA_PENDIENTE = "No hay nada pendiente de confirmar (ya se confirmó, se canceló o venció). Si querés, pedímelo de nuevo.";
const TEXTO_PROCESANDO = "Todavía lo estoy procesando. Probá de nuevo en unos segundos.";
// Un claim de confirmación sin resultado más viejo que esto es de un intento caído.
const TTL_CLAIM_EN_CURSO_MS = 2 * 60 * 1000;
const TEXTO_VENCIDA = "Pasó demasiado tiempo desde que te lo pregunté, así que no cambié nada. Pedímelo de nuevo si querés.";
const TEXTO_CAMBIO_ENTRE_MEDIO = "Ese medicamento cambió mientras tanto, así que no toqué nada. Pedímelo de nuevo para que lo revise.";
const TEXTO_SIN_PERMISO = "Ya no tenés permiso para editar a esa persona, así que no cambié nada.";
export const TEXTO_CANCELADO = "Listo, no cambié nada.";

type Cliente = SupabaseClient;

/** Lo que devuelve la tool al modelo cuando la acción quedó esperando el Confirmar. */
function resultadoEsperando(texto: string, pendienteId: string): ResultadoTool {
  return {
    contenido: `ESPERANDO CONFIRMACIÓN: NO se ejecutó nada todavía. La app le muestra al usuario la pregunta "${texto}" con los botones Confirmar y Cancelar. Decile con tus palabras, en una frase, esa misma pregunta (con el nombre, la hora, la persona si es otra y lo que se pierde o cambia) y esperá. NUNCA digas que ya se borró o se cambió: eso lo confirma el servidor cuando el usuario toca Confirmar. No vuelvas a llamar a la tool para este mismo pedido.`,
    accionUI: opcionesConfirmarAccion(pendienteId),
  };
}

/**
 * delete_schedule / update_schedule: resuelve la fila y guarda la acción
 * pendiente. No escribe ningún dato de medicamentos.
 */
export async function proponerAccionDestructiva(
  nombre: "delete_schedule" | "update_schedule",
  input: Record<string, unknown>,
  destino: { destinoId: string; persona: string | null },
  ctx: { supabase: Cliente; usuarioId: string; pedidoId: string }
): Promise<ResultadoTool> {
  const { supabase, usuarioId, pedidoId } = ctx;
  const buscado = typeof input.medication_name === "string" ? input.medication_name.trim() : "";
  if (!buscado) return { contenido: "Falta medication_name. No se ejecutó nada." };

  let todos;
  try {
    todos = await medicamentos.listarTodos(supabase, destino.destinoId);
  } catch {
    return { contenido: MENSAJE_NO_VERIFICADA };
  }

  const hint = typeof input.medication_time_hint === "string" ? input.medication_time_hint : undefined;
  const r = resolverMedicamento(todos, buscado, hint);
  if (r.estado === "no_encontrado") {
    return { contenido: `No encontré un medicamento llamado "${buscado}". Decíselo al usuario y preguntale el nombre exacto.` };
  }
  if (r.estado === "ambiguo") {
    const lista = r.candidatos.map((c) => `${c.hora}${c.dosis ? ` (${c.dosis})` : ""}`).join(", ");
    return {
      contenido: r.mismaHora
        ? `Hay varios medicamentos que coinciden con "${buscado}" y alguno comparte la hora (${lista}), así que no puedo distinguirlos por hora. NO se ejecutó nada. Decile al usuario cuáles hay y que lo resuelva desde la pantalla Mis medicamentos.`
        : `Hay ${r.candidatos.length} medicamentos que coinciden con "${buscado}", a estas horas: ${lista}. NO se ejecutó nada. Preguntale al usuario cuál (la hora) y recién con su respuesta volvé a llamar a la tool pasando esa hora en medication_time_hint.`,
    };
  }

  const medicamento = r.medicamento;
  const accion: AccionGuardada = {
    tool: nombre,
    destinoId: destino.destinoId,
    medicamentoId: medicamento.id,
    persona: destino.persona,
  };

  if (nombre === "update_schedule") {
    const cambios = cambiosDeInput(input);
    if ("error" in cambios) return { contenido: `${cambios.error} No se ejecutó nada.` };
    accion.cambios = cambios.datos;
  }

  const texto = textoPropuesta(accion, medicamento);
  const id = crypto.randomUUID();
  try {
    // Una sola pendiente por usuario: la nueva reemplaza a la anterior.
    const { error: errLimpiar } = await supabase
      .from("acciones_agente")
      .delete()
      .eq("usuario_id", usuarioId)
      .eq("tipo", "confirmacion");
    if (errLimpiar) throw errLimpiar;
    const { error } = await supabase.from("acciones_agente").insert({
      id,
      usuario_id: usuarioId,
      pedido_id: pedidoId,
      clave: `confirmar:${id}`,
      tipo: "confirmacion",
      accion,
      texto,
      snapshot: tomarSnapshot(medicamento),
      vence_at: new Date(Date.now() + VENTANA_ACCION_PENDIENTE_MS).toISOString(),
    });
    if (error) throw error;
  } catch {
    return { contenido: MENSAJE_NO_VERIFICADA };
  }
  return resultadoEsperando(texto, id);
}

// Valida y convierte los cambios que pidió el modelo (inglés, texto libre) a los
// del núcleo, ANTES de guardar: lo que se guarda es exactamente lo que se ejecuta.
function cambiosDeInput(input: Record<string, unknown>): { datos: DatosActualizarHorario } | { error: string } {
  const datos: DatosActualizarHorario = {};
  try {
    if (input.scheduled_time !== undefined && input.scheduled_time !== null && input.scheduled_time !== "") {
      const m = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(input.scheduled_time).trim());
      if (!m || Number(m[1]) > 23) return { error: `scheduled_time inválido: "${String(input.scheduled_time)}" (formato HH:MM).` };
      datos.horaProgramada = hhmm(`${m[1]}:${m[2]}`);
      // La hora es la única fuente de verdad del momento del día (igual que en add_medication).
      datos.momentoDia = momentoDelDia(datos.horaProgramada);
    } else if (input.time_of_day) {
      datos.momentoDia = momentoDiaDesdeIngles(String(input.time_of_day));
    }
    if (Array.isArray(input.recurring_days)) datos.diasRecurrentes = diasDesdeIngles(input.recurring_days as string[]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Datos inválidos." };
  }
  if (datos.horaProgramada === undefined && datos.momentoDia === undefined && datos.diasRecurrentes === undefined) {
    return { error: "No indicaste qué cambiar (scheduled_time, time_of_day o recurring_days)." };
  }
  return { datos };
}

/** G3: borra las pendientes del usuario. Devuelve cuántas había, o null si falló. */
export async function limpiarPendientes(supabase: Cliente, usuarioId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("acciones_agente")
      .delete()
      .eq("usuario_id", usuarioId)
      .eq("tipo", "confirmacion")
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  } catch (e) {
    // Sin la tabla no puede haber pendientes que limpiar (los destructivos fallan cerrados igual).
    return esTablaInexistente(e) ? 0 : null;
  }
}

/** Id y fecha de creación de la pendiente del usuario (para un "sí" tipeado), o null si no hay o falló. */
export async function idPendiente(supabase: Cliente, usuarioId: string): Promise<{ id: string; creadaAt: string } | null> {
  try {
    const { data, error } = await supabase
      .from("acciones_agente")
      .select("id, created_at")
      .eq("usuario_id", usuarioId)
      .eq("tipo", "confirmacion")
      .limit(1);
    if (error) throw error;
    const fila = data?.[0];
    return fila ? { id: fila.id as string, creadaAt: fila.created_at as string } : null;
  } catch {
    return null;
  }
}

/**
 * Botones de la pendiente creada por ESTE pedido: se re-emiten cuando un
 * reintento solo reproduce el texto guardado (la accionUI de opciones no se
 * guarda en `resultado`). Nunca lanza.
 */
export async function opcionesPendienteDelPedido(
  supabase: Cliente,
  usuarioId: string,
  pedidoId: string
): Promise<AccionOpciones | null> {
  try {
    const { data, error } = await supabase
      .from("acciones_agente")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("pedido_id", pedidoId)
      .eq("tipo", "confirmacion")
      .limit(1);
    if (error || !data?.[0]) return null;
    return opcionesConfirmarAccion(data[0].id as string);
  } catch {
    return null;
  }
}

/** `codigo` solo viene cuando la confirmación NO se ejecutó (para registros_chat.error_codigo). */
export type SalidaConfirmacion = { texto: string; accionUI?: AccionUI; codigo?: string };

/**
 * Confirmar, en este orden: (1) claim del pedido `ejecutada:<id>` (claim-before-
 * execute: un reintento en vuelo recibe "procesando", uno terminado recibe lo
 * guardado); (2) consumir la pendiente (delete…select por id y dueño: solo la
 * gana quien borra la fila); (3) vencimiento, permiso y que la fila siga igual
 * a lo que se mostró; (4) ejecutar por id con el núcleo. Si algo LANZA antes de
 * dejar un resultado, se repone la pendiente y se libera el claim para que
 * "Reintentar" funcione; como borrar/actualizar por id son idempotentes y el
 * snapshot se revalida, un reintento nunca ejecuta dos veces. Nunca lanza.
 */
export async function confirmarPendiente(
  supabase: Cliente,
  usuarioId: string,
  pedidoId: string,
  pendienteId: string,
  familia: MiembroFamilia[]
): Promise<SalidaConfirmacion> {
  const filtro = { usuario_id: usuarioId, pedido_id: pedidoId, clave: `ejecutada:${pendienteId}` };
  const reclamar = async () => {
    const { data, error } = await supabase
      .from("acciones_agente")
      .upsert(filtro, { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return !!data;
  };
  const liberar = async () => {
    try {
      await supabase.from("acciones_agente").delete().match(filtro);
    } catch {
      // Best-effort: un claim sin resultado vence solo (2 min).
    }
  };
  const guardar = async (salida: SalidaConfirmacion): Promise<SalidaConfirmacion> => {
    try {
      const resultado: ResultadoTool = { contenido: salida.texto, ...(salida.accionUI ? { accionUI: salida.accionUI } : {}) };
      await supabase.from("acciones_agente").update({ resultado }).match(filtro);
    } catch {
      // Best-effort: la pendiente ya está consumida, no se puede ejecutar dos veces.
    }
    return salida;
  };

  let reclamado = false;
  let consumida: Record<string, unknown> | null = null;
  try {
    if (!(await reclamar())) {
      const { data: previo, error: errPrevio } = await supabase
        .from("acciones_agente")
        .select("resultado, created_at")
        .match(filtro)
        .maybeSingle();
      if (errPrevio) throw errPrevio;
      const r = previo?.resultado as ResultadoTool | null | undefined;
      if (r && typeof r.contenido === "string") return { texto: r.contenido, accionUI: r.accionUI };
      const edadMs = previo?.created_at ? Date.now() - new Date(previo.created_at as string).getTime() : 0;
      if (!previo || edadMs <= TTL_CLAIM_EN_CURSO_MS) return { texto: TEXTO_PROCESANDO, codigo: "confirmacion_procesando" };
      // Claim huérfano de un intento caído (la pendiente se repuso o ya no está): se retoma.
      await liberar();
      if (!(await reclamar())) return { texto: TEXTO_PROCESANDO, codigo: "confirmacion_procesando" };
    }
    reclamado = true;

    const { data: consumidas, error: errConsumo } = await supabase
      .from("acciones_agente")
      .delete()
      .eq("id", pendienteId)
      .eq("usuario_id", usuarioId)
      .eq("tipo", "confirmacion")
      .select("pedido_id, clave, accion, texto, snapshot, vence_at");
    if (errConsumo) throw errConsumo;
    consumida = (consumidas?.[0] as Record<string, unknown> | undefined) ?? null;
    if (!consumida) return guardar({ texto: TEXTO_NADA_PENDIENTE, codigo: "confirmacion_nada_pendiente" });

    const accion = consumida.accion;
    if (!esAccionGuardada(accion)) return guardar({ texto: TEXTO_NO_VERIFICADA, codigo: "confirmacion_no_verificada" });
    if (!pendienteVigente(consumida.vence_at as string | null, Date.now())) return guardar({ texto: TEXTO_VENCIDA, codigo: "confirmacion_vencida" });

    // El destino tiene que seguir siendo el propio usuario o alguien con rol editar.
    const permitido =
      accion.destinoId === usuarioId || familia.some((f) => f.id === accion.destinoId && f.rol === "editar");
    if (!permitido) return guardar({ texto: TEXTO_SIN_PERMISO, codigo: "confirmacion_sin_permiso" });

    const snapshot = consumida.snapshot as SnapshotMedicamento | null;
    const actual = await medicamentos.obtenerPorId(supabase, accion.destinoId, accion.medicamentoId);
    if (!snapshot || !actual || !snapshotCoincide(snapshot, actual)) {
      return guardar({ texto: TEXTO_CAMBIO_ENTRE_MEDIO, codigo: "confirmacion_cambio" });
    }

    const conPersona = accion.persona ? { persona: accion.persona } : {};
    if (accion.tool === "delete_schedule") {
      await medicamentos.eliminarHorario(supabase, accion.destinoId, accion.medicamentoId);
      return guardar({ texto: textoExito(accion, snapshot), accionUI: { type: "medication_deleted", ...conPersona } });
    }
    await medicamentos.actualizarHorario(supabase, accion.destinoId, accion.medicamentoId, accion.cambios ?? {});
    return guardar({ texto: textoExito(accion, snapshot), accionUI: { type: "schedule_updated", ...conPersona } });
  } catch {
    // Falló sin dejar un resultado: se repone la pendiente (si ya se había consumida) y se libera
    // el claim para que el reintento pueda volver a confirmar.
    if (consumida) {
      try {
        await supabase.from("acciones_agente").insert({
          id: pendienteId,
          usuario_id: usuarioId,
          pedido_id: consumida.pedido_id,
          clave: consumida.clave,
          tipo: "confirmacion",
          accion: consumida.accion,
          texto: consumida.texto,
          snapshot: consumida.snapshot,
          vence_at: consumida.vence_at,
        });
      } catch {
        // Si ya hay otra pendiente (índice único) o falla, queda sin reponer: no se ejecuta nada.
      }
    }
    if (reclamado) await liberar();
    return { texto: TEXTO_NO_VERIFICADA, codigo: "confirmacion_no_verificada" };
  }
}
