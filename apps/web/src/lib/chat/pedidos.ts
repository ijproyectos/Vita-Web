import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ejecutarTool, type ResultadoTool } from "@/lib/ai/tools";
import {
  mensajeEsperandoConfirmacion,
  mensajeFaltaConfirmacion,
  opcionesConfirmarAccion,
  opcionesConfirmarPara,
  opcionesElegirDestino,
  resolverDestino,
  TOOLS_CONFIRMACION_ATADA,
  TOOLS_CONFIRMACION_PROPIA,
  TOOLS_DE_ESCRITURA,
} from "@/lib/ai/destino";
import { limpiarDato } from "@/lib/ai/limpiar";
import { clasificarRespuesta } from "@/lib/ai/respuesta";
import { claveSemantica } from "@/lib/chat/clave";
import {
  cambiosDeInput,
  destinoPermitido,
  pendienteVigente,
  resolverMedicamento,
  snapshotCoincide,
  textoExito,
  textoPropuesta,
  tomarSnapshot,
  autorizaPendiente,
  esObjetivoGuardado,
  type ObjetivoGuardado,
} from "@/lib/chat/confirmaciones-logica";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import type { MiembroFamilia } from "@/lib/familia/tipos";

// Reintentos sin duplicar escrituras (migración 030, `acciones_agente`).
// Cada mensaje del chat trae un `pedido_id`; antes de ejecutar una tool que
// ESCRIBE se reclama una fila (usuario, pedido, clave). Si ya existía, la
// acción ya se hizo en un intento anterior: se devuelve lo guardado.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el pedidoId del cliente; si falta o es inválido genera uno (clientes viejos). */
export function normalizarPedidoId(entrante: unknown): string {
  return typeof entrante === "string" && UUID_RE.test(entrante) ? entrante : crypto.randomUUID();
}

// La lectura sí/no del mensaje del usuario vive en lib/ai/respuesta.ts (pura, probable).
export { clasificarRespuesta };

// Un claim sin resultado más viejo que esto es de un intento que se cayó a
// mitad de camino: se descarta y se vuelve a ejecutar.
const TTL_CLAIM_SIN_RESULTADO_MS = 2 * 60 * 1000;

const MENSAJE_YA_PEDIDA =
  "Esta acción ya se había pedido en un intento anterior y puede estar hecha. No la repitas: verificá con las tools de lectura antes de volver a escribir.";

// Una confirmación pendiente (pregunta hecha al usuario) solo vale este rato.
const VENTANA_CONFIRMACION_MS = 5 * 60 * 1000;

type Contexto = {
  supabase: SupabaseClient;
  usuarioId: string;
  pedidoId: string;
  /** Sesión de chat de este pedido: las confirmaciones pendientes solo valen dentro de ella. */
  sesionId: string;
  /** Texto del mensaje ACTUAL del usuario: la confirmación se lee de acá, no de un pendiente viejo. */
  mensajeUsuario: string;
  /** `clasificarRespuesta(mensajeUsuario)`, calculada UNA vez por request en la route. */
  respuestaUsuario: "si" | "no" | "otro";
  /** Id de la acción pendiente cuyo botón tocó el usuario (validado como uuid), si lo hay. */
  confirmacionId?: string;
  familia: MiembroFamilia[];
  /** Perfil de un familiar abierto en pantalla (ya validado), si lo hay. */
  abiertoId?: string;
  /** Botón Confirmar sin modelo: si la pendiente no se puede consumir NO se crea otra, se informa. */
  soloConfirmar?: boolean;
};

/** true solo si el error es CLARAMENTE "la tabla acciones_agente no existe" (migración 030 sin aplicar). */
function esTablaInexistente(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  if (code === "PGRST205" || code === "42P01") return true;
  // Por mensaje, solo si nombra la tabla: "does not exist" también sale para una
  // columna o función faltante, y ahí hay que fallar cerrado.
  return (
    typeof message === "string" &&
    /acciones_agente/i.test(message) &&
    /relation .* does not exist|could not find the table/i.test(message)
  );
}

const MENSAJE_CONFIRMACION_RECHAZADA =
  "El usuario respondió que NO (o canceló): la acción NO se ejecutó. No insistas ni la repitas; confirmale que no se hizo nada.";

const MENSAJE_CONFIRMACION_NO_VERIFICADA =
  "No pude verificar la confirmación del usuario (error temporal), así que NO se ejecutó nada. Decile al usuario que lo intente de nuevo en un momento.";

type AccionPendiente = {
  tool: string;
  /** Input del modelo SIN `confirmado` ni `persona_id`: es lo que se ejecuta al confirmar. */
  input: Record<string, unknown>;
  destinoId: string;
  persona: string;
  /** Nació de "FALTA DESTINO": un "sí" genérico no alcanza si hay más de una pendiente. */
  origenDestino?: boolean;
  /** Sesión de chat donde se preguntó: otra sesión nunca puede confirmarla. */
  sesionId?: string;
  /** Borrar/cambiar un horario: la fila exacta que se le mostró al usuario (se ejecuta por id). */
  objetivo?: ObjetivoGuardado;
};


const TEXTO_NO_VERIFICADA = "No pude confirmarlo por un problema temporal, así que no cambié nada. Probá de nuevo en un momento.";
const TEXTO_NADA_PENDIENTE = "No hay nada pendiente de confirmar (ya se confirmó, se canceló o venció). Si querés, pedímelo de nuevo.";
const TEXTO_SIN_PERMISO = "Ya no tenés permiso para editar a esa persona, así que no cambié nada.";
const TEXTO_CAMBIO_ENTRE_MEDIO = "Ese medicamento cambió mientras tanto, así que no toqué nada. Pedímelo de nuevo para que lo revise.";

type ResolucionObjetivo = { ok: true; objetivo: ObjetivoGuardado } | { ok: false; resultado: ResultadoTool };

/**
 * delete_schedule / update_schedule: resuelve la fila EXACTA antes de preguntar. No
 * encontrada -> lo dice; varias con el mismo nombre y sin hora que acierte -> pide la
 * hora (nunca elige la primera); una sola -> la pregunta con su snapshot. Falla cerrado.
 */
async function resolverObjetivo(
  nombre: string,
  input: Record<string, unknown>,
  destino: { destinoId: string; persona: string | null },
  supabase: SupabaseClient
): Promise<ResolucionObjetivo> {
  const buscado = typeof input.medication_name === "string" ? input.medication_name.trim() : "";
  if (!buscado) return { ok: false, resultado: { contenido: "Falta medication_name. No se ejecutó nada." } };
  let todos;
  try {
    todos = await medicamentos.listarTodos(supabase, destino.destinoId);
  } catch {
    return { ok: false, resultado: { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA } };
  }
  const hint = typeof input.medication_time_hint === "string" ? input.medication_time_hint : undefined;
  const r = resolverMedicamento(todos, buscado, hint);
  if (r.estado === "no_encontrado") {
    return {
      ok: false,
      resultado: { contenido: `No encontré un medicamento llamado "${limpiarDato(buscado)}". Decíselo al usuario y preguntale el nombre exacto. No se ejecutó nada.` },
    };
  }
  if (r.estado === "ambiguo") {
    const lista = r.candidatos.map((c) => `${c.hora}${c.dosis ? ` (${limpiarDato(c.dosis, 20)})` : ""}`).join(", ");
    return {
      ok: false,
      resultado: {
        contenido: r.mismaHora
          ? `Hay varios medicamentos que coinciden con "${limpiarDato(buscado)}" y alguno comparte la hora (${lista}), así que no puedo distinguirlos por hora. NO se ejecutó nada. Decile al usuario cuáles hay y que lo resuelva desde la pantalla Mis medicamentos.`
          : `Hay ${r.candidatos.length} medicamentos que coinciden con "${limpiarDato(buscado)}", a estas horas: ${lista}. NO se ejecutó nada. Preguntale al usuario cuál (la hora) y recién con su respuesta volvé a llamar a la tool pasando esa hora en medication_time_hint.`,
      },
    };
  }
  const tool = nombre as "delete_schedule" | "update_schedule";
  let cambios;
  if (tool === "update_schedule") {
    const c = cambiosDeInput(input);
    if ("error" in c) return { ok: false, resultado: { contenido: `${c.error} No se ejecutó nada.` } };
    cambios = c.datos;
  }
  return {
    ok: true,
    objetivo: {
      medicamentoId: r.medicamento.id,
      snapshot: tomarSnapshot(r.medicamento),
      texto: textoPropuesta(tool, destino.persona, r.medicamento, cambios),
      ...(cambios ? { cambios } : {}),
    },
  };
}

/**
 * Ejecuta lo CONFIRMADO, por id y con el núcleo (nunca por nombre ni con lo que el modelo
 * reformule): relee el permiso sobre el destino y que la fila siga igual a lo que se mostró.
 */
async function ejecutarObjetivo(
  nombre: string,
  accion: AccionPendiente | null,
  ctx: { supabase: SupabaseClient; usuarioId: string; familia: MiembroFamilia[] }
): Promise<ResultadoTool> {
  const falla = (texto: string, codigo: string): ResultadoTool => ({
    contenido: `${texto} No se ejecutó nada; contale al usuario lo que pasó en una frase.`,
    textoUsuario: texto,
    codigo,
  });
  if (!accion || accion.tool !== nombre || !esObjetivoGuardado(accion.objetivo)) {
    return falla(TEXTO_NO_VERIFICADA, "confirmacion_no_verificada");
  }
  const { objetivo, destinoId } = accion;
  const tool = nombre as "delete_schedule" | "update_schedule";
  if (!destinoPermitido(destinoId, ctx.usuarioId, ctx.familia)) return falla(TEXTO_SIN_PERMISO, "confirmacion_sin_permiso");
  try {
    const actual = await medicamentos.obtenerPorId(ctx.supabase, destinoId, objetivo.medicamentoId);
    if (!actual || !snapshotCoincide(objetivo.snapshot, actual)) return falla(TEXTO_CAMBIO_ENTRE_MEDIO, "confirmacion_cambio");
    const persona = accion.persona ? accion.persona : null;
    const texto = textoExito(tool, persona, objetivo.snapshot, objetivo.cambios);
    const conPersona = persona ? { persona } : {};
    if (tool === "delete_schedule") {
      await medicamentos.eliminarHorario(ctx.supabase, destinoId, objetivo.medicamentoId);
      return { contenido: texto, textoUsuario: texto, accionUI: { type: "medication_deleted", ...conPersona } };
    }
    await medicamentos.actualizarHorario(ctx.supabase, destinoId, objetivo.medicamentoId, objetivo.cambios ?? {});
    return { contenido: texto, textoUsuario: texto, accionUI: { type: "schedule_updated", ...conPersona } };
  } catch {
    return falla(TEXTO_NO_VERIFICADA, "confirmacion_no_verificada");
  }
}

function sinMarcas(input: Record<string, unknown>): Record<string, unknown> {
  const { confirmado: _c, persona_id: _p, ...resto } = input;
  void _c;
  void _p;
  return resto;
}

/** Borra TODAS las pendientes del usuario (un "no"/"cancelar" las invalida). Nunca lanza. */
export async function purgarPendientes(supabase: SupabaseClient, usuarioId: string): Promise<void> {
  try {
    await supabase.from("acciones_agente").delete().eq("usuario_id", usuarioId).like("clave", "pendiente:%");
  } catch {
    // Best-effort: confirmacionDelServidor vuelve a descartarlas ante un "no".
  }
}

async function guardarPendiente(
  supabase: SupabaseClient,
  usuarioId: string,
  pedidoId: string,
  clave: string,
  accion: AccionPendiente
): Promise<{ estado: "ok"; id: string | null } | { estado: "sin_tabla" | "error"; id: null }> {
  const clavePendiente = `pendiente:${clave}`;
  try {
    // Una sola pendiente vigente por acción: las de pedidos anteriores se reemplazan.
    const { error: errBorrar } = await supabase
      .from("acciones_agente")
      .delete()
      .eq("usuario_id", usuarioId)
      .eq("clave", clavePendiente)
      .neq("pedido_id", pedidoId);
    if (errBorrar) throw errBorrar;
    const { error } = await supabase
      .from("acciones_agente")
      .upsert(
        { usuario_id: usuarioId, pedido_id: pedidoId, clave: clavePendiente, resultado: { pendiente: accion } },
        { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true }
      );
    if (error) throw error;
    const { data, error: errLeer } = await supabase
      .from("acciones_agente")
      .select("id")
      .eq("usuario_id", usuarioId)
      .eq("pedido_id", pedidoId)
      .eq("clave", clavePendiente)
      .maybeSingle();
    if (errLeer) throw errLeer;
    return { estado: "ok", id: (data?.id as string | undefined) ?? null };
  } catch (e) {
    return { estado: esTablaInexistente(e) ? "sin_tabla" : "error", id: null };
  }
}

function pendienteDe(resultado: unknown): AccionPendiente | null {
  const p = (resultado as { pendiente?: AccionPendiente } | null | undefined)?.pendiente;
  return p && typeof p.tool === "string" && p.input && typeof p.input === "object" ? p : null;
}

type EstadoConfirmacion =
  | { estado: "confirmada"; accion: AccionPendiente | null }
  | { estado: "pendiente"; id: string | null }
  | { estado: "rechazada" }
  | { estado: "sin_tabla" }
  | { estado: "error" };

/**
 * Confirmación del usuario para escribir en OTRA persona, hecha cumplir por el
 * servidor (el flag `confirmado` del modelo no vale nada). Sin confirmación válida
 * se deja una fila `pendiente:<clave>` (bajo el pedido ACTUAL, con la acción
 * exacta en `resultado`) y se devuelve "pendiente" con su id. Se ejecuta solo si
 * existe una pendiente con la MISMA clave de un pedido ANTERIOR de menos de 5 min
 * (que se consume) Y además:
 * - el usuario tocó su botón (`confirmacionId` == id de la pendiente), o
 * - su mensaje ACTUAL es un sí explícito (`respuesta`), salvo que la acción sea
 *   clínica/destructiva (`atada`) o nacida de "FALTA DESTINO": ahí el "sí" tipeado
 *   solo vale si esa es la ÚNICA pendiente vigente (un "sí" genérico no puede
 *   ejecutar otra acción).
 * Un "no" borra TODAS las pendientes y devuelve "rechazada". Dentro del mismo
 * pedido no se confirma, salvo por el marcador `confirmada:<clave>` que deja esta
 * función al consumir (permite reintentar el pedido).
 * "sin_tabla": la tabla no existe (030 pendiente) y "error": cualquier otro fallo
 * de la contabilidad. Ambos FALLAN CERRADO para otra persona: no se ejecuta.
 */
async function confirmacionDelServidor(p: {
  supabase: SupabaseClient;
  usuarioId: string;
  pedidoId: string;
  clave: string;
  respuesta: "si" | "no" | "otro";
  confirmacionId?: string;
  sesionId: string;
  atada: boolean;
  accion: AccionPendiente;
}): Promise<EstadoConfirmacion> {
  const { supabase, usuarioId, pedidoId, clave, respuesta, confirmacionId, sesionId, atada, accion } = p;
  const clavePendiente = `pendiente:${clave}`;
  const claveConfirmada = `confirmada:${clave}`;
  try {
    const { data: marcador, error: errMarcador } = await supabase
      .from("acciones_agente")
      .select("id, resultado")
      .eq("usuario_id", usuarioId)
      .eq("pedido_id", pedidoId)
      .eq("clave", claveConfirmada)
      .limit(1);
    if (errMarcador) throw errMarcador;
    if (marcador && marcador.length > 0) return { estado: "confirmada", accion: pendienteDe(marcador[0].resultado) };

    if (respuesta === "no") {
      const { error: errLimpiar } = await supabase
        .from("acciones_agente")
        .delete()
        .eq("usuario_id", usuarioId)
        .like("clave", "pendiente:%");
      if (errLimpiar) throw errLimpiar;
      return { estado: "rechazada" };
    }

    const desde = new Date(Date.now() - VENTANA_CONFIRMACION_MS).toISOString();
    const { data: previas, error } = await supabase
      .from("acciones_agente")
      .select("id, resultado")
      .eq("usuario_id", usuarioId)
      .eq("clave", clavePendiente)
      .neq("pedido_id", pedidoId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    // Solo cuentan pendientes de ESTA sesión de chat (las sin sesión, viejas, no valen).
    const previa = previas?.find((f) => pendienteDe(f.resultado)?.sesionId === sesionId);
    if (previa) {
      const guardada = pendienteDe(previa.resultado);
      let vigentesEnSesion = 1;
      const necesitaUnica = respuesta === "si" && (atada || !!guardada?.origenDestino) && !(confirmacionId && confirmacionId === previa.id);
      if (necesitaUnica) {
        // Acción atada: el "sí" tipeado vale solo si es la única pendiente vigente.
        const { data: vigentes, error: errVigentes } = await supabase
          .from("acciones_agente")
          .select("id, resultado")
          .eq("usuario_id", usuarioId)
          .like("clave", "pendiente:%")
          .neq("pedido_id", pedidoId)
          .gte("created_at", desde)
          .limit(50);
        if (errVigentes) throw errVigentes;
        vigentesEnSesion = (vigentes ?? []).filter((f) => pendienteDe(f.resultado)?.sesionId === sesionId).length;
      }
      const autorizada = autorizaPendiente({
        confirmacionId,
        pendienteId: previa.id as string,
        respuesta,
        atada,
        origenDestino: !!guardada?.origenDestino,
        vigentesEnSesion,
      });
      if (autorizada) {
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
              { usuario_id: usuarioId, pedido_id: pedidoId, clave: claveConfirmada, resultado: { pendiente: guardada ?? accion } },
              { onConflict: "usuario_id,pedido_id,clave", ignoreDuplicates: true }
            );
          return { estado: "confirmada", accion: guardada };
        }
      }
    }
    const nueva = await guardarPendiente(supabase, usuarioId, pedidoId, clave, accion);
    if (nueva.estado !== "ok") return { estado: nueva.estado };
    return { estado: "pendiente", id: nueva.id };
  } catch (e) {
    return { estado: esTablaInexistente(e) ? "sin_tabla" : "error" };
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

// "Falta confirmar": el texto para el modelo + los botones de respuesta rápida
// para el usuario (accionUI de solo UI, no cuenta como escritura).
function faltaConfirmacion(persona: string | null, confirmacionId?: string | null): ResultadoTool {
  const nombre = persona ?? "esa persona";
  return { contenido: mensajeFaltaConfirmacion(nombre), accionUI: opcionesConfirmarPara(nombre, confirmacionId) };
}

// Fail-closed: sin poder verificar la confirmación NO se toca a otra persona,
// ni siquiera si el modelo dice `confirmado: true`.
function noDisponible(persona: string | null): ResultadoTool {
  return {
    contenido: `NO DISPONIBLE: no puedo modificar datos de ${limpiarDato(persona ?? "esa persona")} ahora (no se puede verificar la confirmación). No se ejecutó nada. Decile al usuario que lo intente más tarde o lo cargue desde la app.`,
  };
}

/**
 * Falta saber para quién es una escritura (guardia de destino equivocado): se
 * guarda una pendiente por candidato y los botones "Para X" quedan atados a ella,
 * así tocar "Para X" completa la acción en UNA ronda (sin una segunda confirmación).
 */
async function responderFaltaDestino(
  nombre: string,
  input: Record<string, unknown>,
  candidatos: { id: string; nombre: string }[],
  base: { contenido: string },
  ctx: { supabase: SupabaseClient; usuarioId: string; pedidoId: string; sesionId: string }
): Promise<ResultadoTool> {
  const ids: (string | null)[] = [];
  for (const c of candidatos) {
    const clave = `${c.id}~${claveSemantica(nombre, input)}`;
    const guardada = await guardarPendiente(ctx.supabase, ctx.usuarioId, ctx.pedidoId, clave, {
      tool: nombre,
      input: sinMarcas(input),
      destinoId: c.id,
      persona: limpiarDato(c.nombre),
      origenDestino: true,
      sesionId: ctx.sesionId,
    });
    ids.push(guardada.id);
  }
  return { contenido: base.contenido, accionUI: opcionesElegirDestino(candidatos.map((c) => c.nombre), ids) };
}

/**
 * Como `ejecutarTool`, pero las tools de escritura se reclaman antes de
 * ejecutarse. Cualquier falla de la contabilidad (tabla inexistente, RLS...)
 * degrada a ejecutar la tool como antes SOLO para escrituras sobre uno mismo;
 * sobre otra persona falla cerrado ("NO DISPONIBLE"): el chat sigue andando.
 */
export async function ejecutarToolIdempotente(
  nombre: string,
  input: Record<string, unknown>,
  ctx: Contexto
): Promise<ResultadoTool> {
  const { supabase, usuarioId, pedidoId, sesionId, mensajeUsuario, respuestaUsuario, confirmacionId, familia, abiertoId, soloConfirmar } = ctx;
  const ctxTool = { supabase, usuarioId, familia, abiertoId };
  if (!TOOLS_DE_ESCRITURA.has(nombre)) return ejecutarTool(nombre, input, ctxTool);

  // Destino inválido, rol Lector o falta de confirmación: se devuelve el error
  // al modelo ANTES de reclamar nada (si no, un "falta confirmar" ocuparía la
  // clave y la llamada confirmada del mismo pedido quedaría como "ya pedida").
  const destino = resolverDestino(nombre, input, { ...ctxTool, mensajeUsuario });
  if (!destino.ok) {
    if (destino.faltaDestino) {
      return responderFaltaDestino(nombre, input, destino.faltaDestino.candidatos, destino, { supabase, usuarioId, pedidoId, sesionId });
    }
    return { contenido: destino.contenido, accionUI: destino.accionUI };
  }

  // El destino va en la clave: la misma acción para dos personas distintas en
  // un pedido son dos acciones. El claim sigue siendo del usuario logueado.
  const clave = `${destino.destinoId}~${claveSemantica(nombre, input)}`;

  const filtro = { usuario_id: usuarioId, pedido_id: pedidoId, clave };
  let confirmadaObjetivo: AccionPendiente | null = null;

  if (destino.requiereConfirmacion) {
    // Replay: si este pedido ya ejecutó (o está ejecutando) la acción, no se vuelve a preguntar.
    const existente = await claimExistente(supabase, filtro);
    if (existente === "error") return { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA };
    if (existente !== "ninguno") return existente;

    // Borrar / cambiar un horario: se resuelve la fila exacta ANTES de preguntar (y queda en la pendiente).
    let objetivo: ObjetivoGuardado | undefined;
    if (TOOLS_CONFIRMACION_PROPIA.has(nombre)) {
      const res = await resolverObjetivo(nombre, input, destino, supabase);
      if (!res.ok) return res.resultado;
      objetivo = res.objetivo;
    }

    const estado = await confirmacionDelServidor({
      supabase,
      usuarioId,
      pedidoId,
      clave,
      respuesta: respuestaUsuario,
      confirmacionId,
      sesionId,
      atada: TOOLS_CONFIRMACION_ATADA.has(nombre),
      accion: { tool: nombre, input: sinMarcas(input), destinoId: destino.destinoId, persona: destino.persona ?? "", sesionId, ...(objetivo ? { objetivo } : {}) },
    });
    if (soloConfirmar && estado.estado !== "confirmada") {
      const texto = estado.estado === "error" || estado.estado === "sin_tabla" ? TEXTO_NO_VERIFICADA : TEXTO_NADA_PENDIENTE;
      return { contenido: texto, textoUsuario: texto, codigo: estado.estado === "error" || estado.estado === "sin_tabla" ? "confirmacion_no_verificada" : "confirmacion_nada_pendiente" };
    }
    if (estado.estado === "error") return { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA };
    if (estado.estado === "sin_tabla") return noDisponible(destino.persona);
    if (estado.estado === "rechazada") return { contenido: MENSAJE_CONFIRMACION_RECHAZADA };
    if (estado.estado === "pendiente") {
      if (objetivo) {
        return { contenido: mensajeEsperandoConfirmacion(objetivo.texto), accionUI: opcionesConfirmarAccion(estado.id) };
      }
      return faltaConfirmacion(destino.persona, estado.id);
    }
    // Confirmación válida: se ejecuta lo que el usuario confirmó (la acción
    // GUARDADA, no lo que el modelo reformule ahora). ejecutarTool exige confirmado: true.
    const guardada = estado.accion && estado.accion.tool === nombre ? estado.accion.input : sinMarcas(input);
    input = { ...guardada, persona_id: destino.destinoId, confirmado: true };
    if (TOOLS_CONFIRMACION_PROPIA.has(nombre)) confirmadaObjetivo = estado.accion;
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
    // Escritura sobre OTRA persona: SIEMPRE falla cerrado (tabla inexistente o
    // cualquier otro error). Sobre uno mismo (contrato T4) se ejecuta como siempre.
    if (destino.requiereConfirmacion) {
      return esTablaInexistente(e) ? noDisponible(destino.persona) : { contenido: MENSAJE_CONFIRMACION_NO_VERIFICADA };
    }
    return ejecutarTool(nombre, input, ctxTool);
  }

  let resultado: ResultadoTool;
  try {
    resultado = TOOLS_CONFIRMACION_PROPIA.has(nombre)
      ? await ejecutarObjetivo(nombre, confirmadaObjetivo, { supabase, usuarioId, familia })
      : await ejecutarTool(nombre, input, ctxTool);
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

/**
 * Botón "Confirmar" de una borrada/cambio de horario: se resuelve SIN llamar al modelo.
 * Es el mismo mecanismo de siempre (pendiente de esta sesión, ventana de 5 min, consumo
 * atómico, claim por pedido): se reusa `ejecutarToolIdempotente` con la acción GUARDADA y
 * `confirmacionId`. Devuelve null si no hay una pendiente de este tipo (sigue el flujo normal).
 */
export async function confirmarSinModelo(
  ctx: Omit<Contexto, "respuestaUsuario" | "soloConfirmar" | "mensajeUsuario"> & { confirmacionId: string }
): Promise<{ texto: string; accionUI?: ResultadoTool["accionUI"]; codigo?: string } | null> {
  let fila: { resultado: unknown; created_at: string } | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("acciones_agente")
      .select("resultado, created_at")
      .eq("usuario_id", ctx.usuarioId)
      .eq("id", ctx.confirmacionId)
      .like("clave", "pendiente:%")
      .maybeSingle();
    if (error || !data) return null;
    fila = data as { resultado: unknown; created_at: string };
  } catch {
    return null;
  }
  const p = pendienteDe(fila.resultado);
  if (!p || !TOOLS_CONFIRMACION_PROPIA.has(p.tool) || p.sesionId !== ctx.sesionId) return null;
  if (!pendienteVigente(fila.created_at, Date.now(), VENTANA_CONFIRMACION_MS)) return null;
  const r = await ejecutarToolIdempotente(
    p.tool,
    { ...p.input, persona_id: p.destinoId },
    { ...ctx, mensajeUsuario: "", respuestaUsuario: "otro", soloConfirmar: true }
  );
  return {
    texto: r.textoUsuario ?? TEXTO_NO_VERIFICADA,
    accionUI: r.accionUI,
    ...(r.codigo ? { codigo: r.codigo } : r.textoUsuario ? {} : { codigo: "confirmacion_no_verificada" }),
  };
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
 * - "desconocido": la consulta falló dos veces; el llamador decide (ver route).
 */
export async function estadoDelReintento(
  supabase: SupabaseClient,
  usuarioId: string,
  sesionId: string,
  texto: string
): Promise<{ estado: "nuevo" | "guardado" | "respondido" | "desconocido"; respuesta?: string }> {
  // Un solo reintento de la consulta: un error transitorio no debe decidir entre duplicar o perder el mensaje.
  let data: { role: string; contenido: unknown }[] | null = null;
  for (let intento = 0; intento < 2; intento++) {
    const r = await supabase
      .from("mensajes_chat")
      .select("role, contenido")
      .eq("usuario_id", usuarioId)
      .eq("sesion_id", sesionId)
      .order("created_at", { ascending: false })
      .limit(2);
    if (!r.error) {
      data = r.data ?? [];
      break;
    }
  }
  if (data === null) return { estado: "desconocido" };
  const [ultimo, anterior] = data;
  if (ultimo?.role === "assistant" && anterior?.role === "user" && anterior.contenido === texto) {
    return { estado: "respondido", respuesta: ultimo.contenido as string };
  }
  if (ultimo?.role === "user" && ultimo.contenido === texto) return { estado: "guardado" };
  return { estado: "nuevo" };
}

/**
 * Tarjetas de las escrituras que el primer intento de este pedido ya hizo, para
 * re-emitirlas cuando el reintento solo reproduce el texto guardado (así el
 * cliente muestra la tarjeta y hace router.refresh()). Salen del `resultado`
 * guardado en `acciones_agente` (accionUI completa). Limitación: un claim sin
 * resultado (el intento cayó entre la escritura y el guardado) no se puede
 * reconstruir y no emite nada; nunca lanza.
 */
export async function accionesDelPedido(
  supabase: SupabaseClient,
  usuarioId: string,
  pedidoId: string
): Promise<NonNullable<ResultadoTool["accionUI"]>[]> {
  try {
    const { data, error } = await supabase
      .from("acciones_agente")
      .select("clave, resultado")
      .eq("usuario_id", usuarioId)
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? [])
      .filter((f) => !/^(pendiente|confirmada):/.test(f.clave as string))
      .map((f) => (f.resultado as ResultadoTool | null)?.accionUI)
      .filter((a): a is NonNullable<ResultadoTool["accionUI"]> => !!a);
  } catch {
    return [];
  }
}
