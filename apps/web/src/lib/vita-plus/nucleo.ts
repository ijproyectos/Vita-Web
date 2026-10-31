import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { origenPublico } from "@/lib/email/origen";
import { createAdminClient } from "@/lib/supabase/admin";
import { MENSAJE_SIN_COTIZACION, obtenerDolarOficial } from "./cotizacion";
import {
  clasificarErrorRpc,
  clasificarFalloMp,
  construirBackUrl,
  construirCuerpoPreapproval,
  decidirPago,
  esInitPointMp,
  esIdSeguro,
  httpWebhook,
  leerPagoAutorizado,
  leerPreapproval,
  montoCoincide,
  planificarDuplicados,
  TOPIC_PAGO_AUTORIZADO,
  type FalloApi,
  type RefAutorizada,
  type SuscripcionGuardada,
  type TopicSoportado,
} from "./logica";
import { crearClienteMp, leerCreacion, urlPagoAutorizado, urlPreapproval, vitaPlusConfigurado, type ClienteMp } from "./mercadopago";
import {
  calcularPesos,
  cotizarPlanes,
  ESTADO_SIN_VITA_PLUS,
  esPlanVitaPlus,
  PLANES_VITA_PLUS,
  type CotizacionPlanes,
  type EstadoSuscripcion,
  type EstadoVitaPlus,
  type PlanVitaPlus,
} from "./planes";

type Cliente = SupabaseClient;

// --- Lectura (cliente de SESIÓN, RLS) --------------------------------------------------------------------

function esEstado(valor: unknown): valor is EstadoSuscripcion {
  return valor === "none" || valor === "pending" || valor === "authorized" || valor === "paused" || valor === "cancelled";
}

/** Estado de vita+ de la cuenta de la sesión. Nunca lanza: ante cualquier fallo (p. ej. 044 sin aplicar) = sin vita+. */
export async function obtenerEstadoVitaPlus(supabase: Cliente): Promise<EstadoVitaPlus> {
  try {
    const { data, error } = await supabase.rpc("mi_estado_vita_plus");
    if (error) return ESTADO_SIN_VITA_PLUS;
    const fila = (Array.isArray(data) ? data[0] : data) as
      | { vp_activo?: unknown; vp_vence_at?: unknown; vp_plan?: unknown; vp_estado?: unknown; vp_renueva?: unknown }
      | null
      | undefined;
    if (!fila) return ESTADO_SIN_VITA_PLUS;
    return {
      activo: fila.vp_activo === true,
      venceAt: typeof fila.vp_vence_at === "string" ? fila.vp_vence_at : null,
      plan: esPlanVitaPlus(fila.vp_plan) ? fila.vp_plan : null,
      estado: esEstado(fila.vp_estado) ? fila.vp_estado : "none",
      renueva: fila.vp_renueva === true,
    };
  } catch {
    return ESTADO_SIN_VITA_PLUS;
  }
}

/**
 * PUNTO ÚNICO para gatear funciones por vita+ (hoy no se gatea nada: decisión de producto pendiente). Usa el
 * cliente de SESIÓN: la RLS de `vita_plus_vigencia` solo deja leer la fila propia, así que sirve para la cuenta
 * logueada. Ante cualquier fallo devuelve false.
 */
export async function esVitaPlus(supabase: Cliente, usuarioId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("vita_plus_vigencia").select("vence_at").eq("usuario_id", usuarioId).maybeSingle();
    if (error || !data) return false;
    const vence = Date.parse(String((data as { vence_at: unknown }).vence_at));
    return Number.isFinite(vence) && vence > new Date().getTime();
  } catch {
    return false;
  }
}

// --- Cotización ------------------------------------------------------------------------------------------

export type ResultadoCotizar = { ok: true; cotizacion: CotizacionPlanes } | { ok: false; mensaje: string };

export async function cotizarVitaPlus(): Promise<ResultadoCotizar> {
  const fx = await obtenerDolarOficial();
  if (!fx.ok) return { ok: false, mensaje: MENSAJE_SIN_COTIZACION };
  return { ok: true, cotizacion: cotizarPlanes(fx.fx, fx.fecha) };
}

// --- Crear suscripción -----------------------------------------------------------------------------------

export type ResultadoCrear =
  | { ok: true; initPoint: string; pesos: number; fx: number }
  | { ok: false; codigo: string; mensaje: string; http: number };

function fallo(f: FalloApi): ResultadoCrear {
  return { ok: false, codigo: f.codigo, mensaje: f.mensaje, http: f.http };
}

/**
 * Crea la suscripción pendiente y el preapproval en Mercado Pago. El plan es la única entrada del cliente: el
 * precio sale de la tabla del servidor y la cotización se pide ACÁ (nunca se confía en lo que vio la pantalla).
 * `usuario` sale de la sesión ya autenticada. Segundo cliente admin sancionado: las funciones de escritura de
 * la migración 044 solo las ejecuta service_role.
 */
export async function crearSuscripcionVitaPlus(
  supabase: Cliente,
  usuario: { id: string; email: string | undefined },
  plan: PlanVitaPlus
): Promise<ResultadoCrear> {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) {
    return { ok: false, codigo: "no_disponible", mensaje: "vita+ todavía no está disponible.", http: 503 };
  }
  if (!usuario.email) {
    return { ok: false, codigo: "sin_email", mensaje: "Tu cuenta no tiene un email para la suscripción.", http: 422 };
  }
  const backUrl = construirBackUrl(await origenPublico());
  if (!backUrl) {
    console.error("vita+: NEXT_PUBLIC_SITE_URL no es una URL https válida");
    return { ok: false, codigo: "config", mensaje: "vita+ no está bien configurado todavía.", http: 503 };
  }

  const fx = await obtenerDolarOficial();
  if (!fx.ok) return { ok: false, codigo: "sin_cotizacion", mensaje: MENSAJE_SIN_COTIZACION, http: 503 };

  const def = PLANES_VITA_PLUS[plan];
  const pesos = calcularPesos(def.usdCentavos, fx.fx);
  const referencia = randomUUID();
  const admin = createAdminClient();
  const mp = crearClienteMp(token);

  // Un checkout abandonado todavía podría completarse más tarde y cobrar dos veces: se cancelan los pendientes viejos.
  await cancelarPendientesViejos(supabase, admin, mp, usuario.id);

  const { data: id, error: errorRpc } = await admin.rpc("iniciar_suscripcion_vita_plus", {
    p_usuario: usuario.id,
    p_referencia: referencia,
    p_plan: plan,
    p_meses: def.meses,
    p_usd_centavos: def.usdCentavos,
    p_fx: fx.fx,
    p_ars: pesos,
  });
  if (errorRpc || typeof id !== "string") return fallo(clasificarErrorRpc(errorRpc));

  const cuerpo = construirCuerpoPreapproval({
    oferta: { razon: def.razon, meses: def.meses, pesos },
    referenciaExterna: referencia,
    emailPagador: usuario.email,
    backUrl,
  });
  const respuesta = await mp.crearPreapproval(cuerpo);
  const creacion = respuesta.status >= 200 && respuesta.status < 300 ? leerCreacion(respuesta.json) : null;

  if (!creacion || !esInitPointMp(creacion.initPoint) || !esIdSeguro(creacion.id)) {
    await marcarCancelada(admin, id);
    // Si Mercado Pago llegó a crearla pero la respuesta es inservible, se cancela allá también (mejor esfuerzo).
    if (creacion && esIdSeguro(creacion.id)) await mp.cancelar(creacion.id);
    return fallo(clasificarFalloMp(creacion ? 200 : respuesta.status));
  }

  const guardado = await guardarPreapproval(admin, id, creacion.id);
  if (!guardado) {
    // Sin el id guardado el webhook no puede relacionar los cobros: se deshace todo.
    await mp.cancelar(creacion.id);
    await marcarCancelada(admin, id);
    return fallo({ http: 500, codigo: "error", mensaje: "No pudimos iniciar la suscripción. Probá de nuevo." });
  }

  return { ok: true, initPoint: creacion.initPoint, pesos, fx: fx.fx };
}

async function marcarCancelada(admin: Cliente, suscripcionId: string): Promise<void> {
  await admin.rpc("actualizar_estado_suscripcion_vita_plus", { p_suscripcion: suscripcionId, p_estado: "cancelled" });
}

/** Un reintento: guardar el id es lo que permite relacionar los cobros con la persona. */
async function guardarPreapproval(admin: Cliente, suscripcionId: string, preapprovalId: string): Promise<boolean> {
  for (let intento = 0; intento < 2; intento++) {
    const { error } = await admin.rpc("actualizar_estado_suscripcion_vita_plus", {
      p_suscripcion: suscripcionId,
      p_estado: "pending",
      p_preapproval_id: preapprovalId,
    });
    if (!error) return true;
  }
  return false;
}

async function cancelarPendientesViejos(supabase: Cliente, admin: Cliente, mp: ClienteMp, usuarioId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("vita_plus_suscripciones")
      .select("id, preapproval_id")
      .eq("usuario_id", usuarioId)
      .eq("estado", "pending")
      .not("preapproval_id", "is", null);
    for (const fila of (data ?? []) as Array<{ id: string; preapproval_id: string | null }>) {
      if (fila.preapproval_id) await mp.cancelar(fila.preapproval_id);
      await marcarCancelada(admin, fila.id);
    }
  } catch {
    // Mejor esfuerzo: un fallo acá no impide crear la suscripción nueva.
  }
}

// --- Cancelar --------------------------------------------------------------------------------------------

export type ResultadoCancelar = { ok: true } | { ok: false; mensaje: string; http: number };

/**
 * Cancela TODAS las suscripciones no canceladas de la persona en Mercado Pago (corta los cobros futuros). La
 * vigencia ya pagada no se toca: sigue hasta su vencimiento.
 */
export async function cancelarSuscripcionVitaPlus(supabase: Cliente, usuarioId: string): Promise<ResultadoCancelar> {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, mensaje: "vita+ todavía no está disponible.", http: 503 };

  const { data, error } = await supabase
    .from("vita_plus_suscripciones")
    .select("id, preapproval_id, estado")
    .eq("usuario_id", usuarioId)
    .neq("estado", "cancelled");
  if (error) return { ok: false, mensaje: "No pudimos cancelar tu suscripción. Probá de nuevo.", http: 500 };
  const filas = (data ?? []) as Array<{ id: string; preapproval_id: string | null; estado: string }>;
  if (filas.length === 0) return { ok: true };

  const admin = createAdminClient();
  const mp = crearClienteMp(token);
  for (const fila of filas) {
    const { data: puede, error: errorClaim } = await admin.rpc("reclamar_escritura_mp_vita_plus", {
      p_usuario: usuarioId,
      p_suscripcion: fila.id,
      p_min_seg: 5,
    });
    if (errorClaim) return { ok: false, mensaje: "No pudimos cancelar tu suscripción. Probá de nuevo.", http: 500 };
    if (puede !== true) return { ok: false, mensaje: "Esperá unos segundos y probá de nuevo.", http: 429 };

    if (fila.preapproval_id) {
      const r = await mp.cancelar(fila.preapproval_id);
      if (r.status < 200 || r.status >= 300) {
        const f = clasificarFalloMp(r.status);
        return { ok: false, mensaje: f.mensaje, http: f.http };
      }
    }
    const { error: errorEstado } = await admin.rpc("actualizar_estado_suscripcion_vita_plus", {
      p_suscripcion: fila.id,
      p_estado: "cancelled",
    });
    if (errorEstado) return { ok: false, mensaje: "No pudimos cancelar tu suscripción. Probá de nuevo.", http: 500 };
  }
  return { ok: true };
}

// --- Webhook ---------------------------------------------------------------------------------------------

export interface RespuestaWebhook {
  http: number;
  cuerpo: Record<string, unknown>;
}

function responder(tipo: Parameters<typeof httpWebhook>[0], cuerpo: Record<string, unknown>): RespuestaWebhook {
  return { http: httpWebhook(tipo), cuerpo };
}

const REINTENTAR = (): RespuestaWebhook => responder("transitorio", { error: "try_again" });

function respuestaFallo(clase: "transitorio" | "config" | "permanente"): RespuestaWebhook {
  if (clase === "config") return responder("config", { error: "server_misconfigured" });
  if (clase === "permanente") return responder("ignorado", { ignored: "fetch_rejected" });
  return REINTENTAR();
}

const COLUMNAS_SUSCRIPCION = "id, usuario_id, preapproval_id, ars_pesos, creada_at";

async function buscarSuscripcion(
  admin: Cliente,
  columna: "preapproval_id" | "external_reference",
  valor: string
): Promise<{ fila: SuscripcionGuardada | null; fallo: boolean }> {
  const { data, error } = await admin.from("vita_plus_suscripciones").select(COLUMNAS_SUSCRIPCION).eq(columna, valor).maybeSingle();
  if (error) {
    console.error("vita+: no se pudo buscar la suscripción", error.code);
    return { fila: null, fallo: true };
  }
  return { fila: (data as SuscripcionGuardada | null) ?? null, fallo: false };
}

async function cargarAutorizadas(admin: Cliente, usuarioId: string): Promise<RefAutorizada[] | null> {
  const { data, error } = await admin
    .from("vita_plus_suscripciones")
    .select("id, preapproval_id, creada_at")
    .eq("usuario_id", usuarioId)
    .eq("estado", "authorized");
  if (error) {
    console.error("vita+: no se pudieron leer las autorizadas", error.code);
    return null;
  }
  return (data ?? []) as RefAutorizada[];
}

/** Cancela un duplicado en Mercado Pago y lo marca cancelado. false = reintentar la notificación. */
async function cancelarDuplicado(admin: Cliente, mp: ClienteMp, suscripcionId: string, preapprovalId: string | null): Promise<boolean> {
  if (preapprovalId) {
    const r = await mp.cancelar(preapprovalId);
    if (r.status < 200 || r.status >= 300) return false;
  }
  const { error } = await admin.rpc("actualizar_estado_suscripcion_vita_plus", { p_suscripcion: suscripcionId, p_estado: "cancelled" });
  return !error;
}

async function manejarPreapproval(admin: Cliente, mp: ClienteMp, id: string): Promise<RespuestaWebhook> {
  const leido = await mp.leer(urlPreapproval(id));
  if (leido.clase !== "ok") return respuestaFallo(leido.clase);
  const info = leerPreapproval(leido.json);
  if (!info) return REINTENTAR();
  if (!info.estado) return responder("ignorado", { ignored: "unknown_status" });

  let encontrada = await buscarSuscripcion(admin, "preapproval_id", info.id);
  if (encontrada.fallo) return REINTENTAR();
  if (!encontrada.fila && info.referenciaExterna) {
    encontrada = await buscarSuscripcion(admin, "external_reference", info.referenciaExterna);
    if (encontrada.fallo) return REINTENTAR();
  }
  const sub = encontrada.fila;
  if (!sub) return responder("ignorado", { ignored: "unknown_subscription" });

  // Los términos tienen que ser los que guardamos al crear ESTA suscripción (el monto depende del dólar de ese día).
  if (info.tieneMonto && !montoCoincide(info.monto, info.moneda, sub.ars_pesos)) {
    console.error("vita+: el preapproval no coincide con lo guardado");
    return responder("ignorado", { ignored: "offer_mismatch" });
  }

  let masNuevas: RefAutorizada[] = [];
  if (info.estado === "authorized") {
    const autorizadas = await cargarAutorizadas(admin, sub.usuario_id);
    if (!autorizadas) return REINTENTAR();
    const plan = planificarDuplicados(sub, autorizadas);
    if (plan.cancelarEsta) {
      console.error("vita+: suscripción duplicada, se cancela la más nueva");
      if (!(await cancelarDuplicado(admin, mp, sub.id, info.id))) return REINTENTAR();
      return responder("manejado", { handled: "duplicate_cancelled" });
    }
    masNuevas = plan.cancelarOtras;
  }

  const { error } = await admin.rpc("actualizar_estado_suscripcion_vita_plus", {
    p_suscripcion: sub.id,
    p_estado: info.estado,
    p_preapproval_id: info.id,
  });
  if (error) {
    console.error("vita+: no se pudo sincronizar el estado", error.code);
    return REINTENTAR();
  }
  for (const duplicada of masNuevas) {
    if (!(await cancelarDuplicado(admin, mp, duplicada.id, duplicada.preapproval_id))) return REINTENTAR();
  }
  return responder("manejado", { handled: "subscription_status" });
}

async function manejarPagoAutorizado(admin: Cliente, mp: ClienteMp, id: string): Promise<RespuestaWebhook> {
  const leido = await mp.leer(urlPagoAutorizado(id));
  if (leido.clase !== "ok") return respuestaFallo(leido.clase);
  const info = leerPagoAutorizado(leido.json);
  if (!info) return REINTENTAR();

  // Primero la suscripción: el monto esperado es el guardado para ESA suscripción, no una constante global.
  if (info.estadoPago !== "approved") return responder("ignorado", { ignored: "no_aprobado" });
  if (!info.preapprovalId || !info.pagoId || typeof info.monto !== "number" || typeof info.moneda !== "string") {
    console.error("vita+: forma inesperada de pago autorizado");
    return responder("transitorio", { error: "unexpected_shape" });
  }

  let encontrada = await buscarSuscripcion(admin, "preapproval_id", info.preapprovalId);
  if (encontrada.fallo) return REINTENTAR();
  if (!encontrada.fila) {
    // El preapproval_id puede no estar guardado todavía (la notificación se adelantó): se relaciona por external_reference.
    if (!esIdSeguro(info.preapprovalId)) return responder("ignorado", { ignored: "unknown_subscription" });
    const padre = await mp.leer(urlPreapproval(info.preapprovalId));
    if (padre.clase !== "ok") return respuestaFallo(padre.clase);
    const padreInfo = leerPreapproval(padre.json);
    if (!padreInfo?.referenciaExterna) return responder("ignorado", { ignored: "unknown_subscription" });
    encontrada = await buscarSuscripcion(admin, "external_reference", padreInfo.referenciaExterna);
    if (encontrada.fallo) return REINTENTAR();
  }
  const sub = encontrada.fila;
  if (!sub) return responder("ignorado", { ignored: "unknown_subscription" });

  const decision = decidirPago(info, { preapproval_id: sub.preapproval_id ?? info.preapprovalId, ars_pesos: sub.ars_pesos });
  if (decision.tipo === "ignorar") {
    if (decision.motivo === "monto_distinto") console.error("vita+: el cobro no coincide con el monto guardado");
    return responder("ignorado", { ignored: decision.motivo });
  }
  if (decision.tipo === "forma_inesperada") return responder("transitorio", { error: "unexpected_shape" });

  const autorizadas = await cargarAutorizadas(admin, sub.usuario_id);
  if (!autorizadas) return REINTENTAR();
  if (planificarDuplicados(sub, autorizadas).cancelarEsta) {
    console.error("vita+: cobro de una suscripción duplicada, no se acredita");
    await cancelarDuplicado(admin, mp, sub.id, info.preapprovalId);
    return responder("manejado", { handled: "duplicate_not_credited" });
  }

  const { data, error } = await admin.rpc("registrar_pago_vita_plus", {
    p_usuario: sub.usuario_id,
    p_pago: decision.pagoId,
    p_suscripcion: sub.id,
    p_ars: decision.pesos,
  });
  if (error) {
    console.error("vita+: no se pudo acreditar el pago", error.code);
    return REINTENTAR();
  }
  // NULL = ese pago ya estaba acreditado (reenvío): sigue siendo un éxito para Mercado Pago.
  return responder("manejado", { handled: data ? "granted" : "already_processed" });
}

/** Procesa una notificación YA autenticada (firma válida). Nunca lanza. */
export async function procesarNotificacionVitaPlus(topic: TopicSoportado, dataId: string): Promise<RespuestaWebhook> {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) return responder("config", { error: "server_misconfigured" });
  try {
    const admin = createAdminClient();
    const mp = crearClienteMp(token);
    return topic === TOPIC_PAGO_AUTORIZADO ? await manejarPagoAutorizado(admin, mp, dataId) : await manejarPreapproval(admin, mp, dataId);
  } catch (error) {
    console.error("vita+: error inesperado procesando la notificación", error instanceof Error ? error.name : "desconocido");
    return REINTENTAR();
  }
}

export { vitaPlusConfigurado };
