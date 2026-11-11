import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { origenPublico } from "@/lib/email/origen";
import { enviarEmail } from "@/lib/email/smtp";
import { CORREO_SOPORTE } from "@/lib/legal/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { esOrigenVitaPlus } from "./codigos";
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
  type MotivoBaja,
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
      | { vp_activo?: unknown; vp_vence_at?: unknown; vp_plan?: unknown; vp_estado?: unknown; vp_renueva?: unknown; vp_puede_arrepentirse?: unknown; vp_permanente?: unknown; vp_origen?: unknown }
      | null
      | undefined;
    if (!fila) return ESTADO_SIN_VITA_PLUS;
    return {
      activo: fila.vp_activo === true,
      venceAt: typeof fila.vp_vence_at === "string" ? fila.vp_vence_at : null,
      plan: esPlanVitaPlus(fila.vp_plan) ? fila.vp_plan : null,
      estado: esEstado(fila.vp_estado) ? fila.vp_estado : "none",
      renueva: fila.vp_renueva === true,
      puedeArrepentirse: fila.vp_puede_arrepentirse === true,
      permanente: fila.vp_permanente === true,
      origen: esOrigenVitaPlus(fila.vp_origen) ? fila.vp_origen : null,
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
    const { data, error } = await supabase.from("vita_plus_vigencia").select("*").eq("usuario_id", usuarioId).maybeSingle();
    if (error || !data) return false;
    const fila = data as { vence_at: unknown; permanente?: unknown };
    // Sin la 046 la columna `permanente` no existe y `fila.permanente` es undefined: se decide por `vence_at`.
    if (fila.permanente === true) return true;
    const vence = Date.parse(String(fila.vence_at));
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

  // Recién ahora (pasadas las guardas de throttle y de ya-suscripto) se concilian los checkouts viejos.
  if (await conciliarPendientesViejos(supabase, admin, mp, usuario.id, id)) {
    await marcarCancelada(admin, id);
    return fallo(clasificarErrorRpc({ message: "already_subscribed" }));
  }

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

/** Un checkout se considera abandonado recién pasado este tiempo desde que se creó. */
export const MIN_PENDIENTE_ABANDONADO = 30;

/**
 * Concilia los checkouts `pending` de hace más de 30 min contra Mercado Pago ANTES de cancelar nada: si allá ya
 * está autorizada o pausada (la persona pagó y el webhook todavía no llegó) NO se cancela, se sincroniza el
 * estado local y se devuelve true (= ya está suscripta, hay que rechazar la nueva). Si allá sigue `pending`
 * se cancela; si no se pudo leer, se deja como está (lo cubre el chequeo de duplicados del webhook).
 */
async function conciliarPendientesViejos(supabase: Cliente, admin: Cliente, mp: ClienteMp, usuarioId: string, nuevaId: string): Promise<boolean> {
  let yaSuscripta = false;
  try {
    const limite = new Date(new Date().getTime() - MIN_PENDIENTE_ABANDONADO * 60_000).toISOString();
    const { data } = await supabase
      .from("vita_plus_suscripciones")
      .select("id, preapproval_id")
      .eq("usuario_id", usuarioId)
      .eq("estado", "pending")
      .neq("id", nuevaId)
      .lt("creada_at", limite)
      .not("preapproval_id", "is", null);
    for (const fila of (data ?? []) as Array<{ id: string; preapproval_id: string | null }>) {
      if (!fila.preapproval_id || !esIdSeguro(fila.preapproval_id)) continue;
      const leido = await mp.leer(urlPreapproval(fila.preapproval_id));
      if (leido.clase !== "ok") continue;
      const estado = leerPreapproval(leido.json)?.estado;
      if (estado === "authorized" || estado === "paused") {
        await admin.rpc("actualizar_estado_suscripcion_vita_plus", { p_suscripcion: fila.id, p_estado: estado });
        yaSuscripta = true;
      } else if (estado === "pending") {
        const r = await mp.cancelar(fila.preapproval_id);
        if (r.status >= 200 && r.status < 300) await marcarCancelada(admin, fila.id);
      } else if (estado === "cancelled") {
        await marcarCancelada(admin, fila.id);
      }
    }
  } catch {
    // Mejor esfuerzo: un fallo acá no impide crear la suscripción nueva.
  }
  return yaSuscripta;
}

// --- Cancelar --------------------------------------------------------------------------------------------

export type ResultadoCancelar = { ok: true } | { ok: false; mensaje: string; http: number };

/**
 * Cancela TODAS las suscripciones no canceladas de la persona en Mercado Pago (corta los cobros futuros). La
 * vigencia ya pagada no se toca: sigue hasta su vencimiento.
 */
export async function cancelarSuscripcionVitaPlus(
  supabase: Cliente,
  usuarioId: string,
  motivo: MotivoBaja | null = null
): Promise<ResultadoCancelar> {
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
  // Motivo opcional (migración 059). Mejor esfuerzo: sin la tabla o si falla, la baja ya quedó hecha.
  if (motivo) {
    const { error: errorMotivo } = await admin.from("vita_plus_motivos_baja").insert({ usuario_id: usuarioId, motivo });
    if (errorMotivo) console.warn("[vita-plus] motivo de baja no guardado:", errorMotivo.code ?? errorMotivo.message);
  }
  return { ok: true };
}

// --- Botón de arrepentimiento (Res. 424/2020) -------------------------------------------------------------

/**
 * Revocación dentro de los 10 días del primer cobro. Primero queda REGISTRADO el pedido (nunca se pierde), después
 * se corta la suscripción en Mercado Pago y se avisa a soporte por mail (mejor esfuerzo). El reembolso NO es
 * automático: lo procesa una persona. Los datos de contacto salen de la sesión.
 */
export async function ejercerArrepentimientoVitaPlus(
  supabase: Cliente,
  usuario: { id: string; email: string | undefined }
): Promise<ResultadoCancelar> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("solicitar_arrepentimiento_vita_plus", { p_usuario: usuario.id });
  if (error) {
    const f = clasificarErrorRpc(error);
    return { ok: false, mensaje: f.mensaje, http: f.http };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { vp_suscripcion?: string; vp_nueva?: boolean } | null;

  const cancelada = await cancelarSuscripcionVitaPlus(supabase, usuario.id);
  if (!cancelada.ok) {
    return { ok: false, mensaje: "Registramos tu pedido, pero no pudimos cortar el cobro. Probá de nuevo en un momento.", http: cancelada.http };
  }

  if (fila?.vp_nueva) {
    const texto = `Pedido de arrepentimiento de vita+.\nCuenta: ${usuario.id}\nEmail: ${usuario.email ?? "(sin email)"}\nSuscripción: ${fila.vp_suscripcion ?? ""}\nLa suscripción ya fue cancelada en Mercado Pago; falta procesar el reembolso.`;
    void enviarEmail({
      para: CORREO_SOPORTE,
      asunto: "Arrepentimiento de vita+ (reembolso pendiente)",
      texto,
      html: `<p>${texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
      responderA: usuario.email,
    }).catch(() => undefined);
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

interface DatosNoAcreditado {
  clave: string;
  pagoId: string | null;
  preapprovalId: string | null;
  referencia: string | null;
  motivo: string;
  monto: unknown;
  moneda: unknown;
  estadoMp: string | null;
  usuarioId?: string;
  suscripcionId?: string;
}

/**
 * Deja constancia de un cobro (o evento) que NO se acreditó, para revisarlo o reembolsarlo a mano. Un cobro real
 * nunca se descarta en silencio. Devuelve false si no se pudo escribir: el webhook responde 5xx y Mercado Pago
 * reintenta.
 */
async function anotarNoAcreditado(admin: Cliente, d: DatosNoAcreditado): Promise<boolean> {
  const { data, error } = await admin.rpc("anotar_pago_no_acreditado_vita_plus", {
    p_clave: d.clave,
    p_pago_id: d.pagoId,
    p_preapproval_id: d.preapprovalId,
    p_external_reference: d.referencia,
    p_motivo: d.motivo,
    p_monto: typeof d.monto === "number" && Number.isFinite(d.monto) ? d.monto : null,
    p_moneda: typeof d.moneda === "string" ? d.moneda.slice(0, 10) : null,
    p_estado_mp: d.estadoMp,
    p_usuario: d.usuarioId ?? null,
    p_suscripcion: d.suscripcionId ?? null,
  });
  if (error || data !== true) {
    console.error("vita+: no se pudo anotar el cobro no acreditado", error?.code);
    return false;
  }
  return true;
}

async function ignorarAnotando(admin: Cliente, d: DatosNoAcreditado): Promise<RespuestaWebhook> {
  if (!(await anotarNoAcreditado(admin, d))) return REINTENTAR();
  return responder("ignorado", { ignored: d.motivo });
}

async function manejarPreapproval(admin: Cliente, mp: ClienteMp, id: string): Promise<RespuestaWebhook> {
  const leido = await mp.leer(urlPreapproval(id));
  if (leido.clase !== "ok") return respuestaFallo(leido.clase);
  const info = leerPreapproval(leido.json);
  if (!info) return REINTENTAR();
  const evento = (motivo: string, extra: Partial<DatosNoAcreditado> = {}): DatosNoAcreditado => ({
    clave: `pre:${info.id}:${motivo}`,
    pagoId: null,
    preapprovalId: info.id,
    referencia: info.referenciaExterna,
    motivo,
    monto: info.monto,
    moneda: info.moneda,
    estadoMp: null,
    ...extra,
  });
  if (!info.estado) return ignorarAnotando(admin, evento("estado_desconocido"));

  let encontrada = await buscarSuscripcion(admin, "preapproval_id", info.id);
  if (encontrada.fallo) return REINTENTAR();
  if (!encontrada.fila && info.referenciaExterna) {
    encontrada = await buscarSuscripcion(admin, "external_reference", info.referenciaExterna);
    if (encontrada.fallo) return REINTENTAR();
  }
  const sub = encontrada.fila;
  if (!sub) return ignorarAnotando(admin, evento("suscripcion_desconocida"));

  // Los términos tienen que ser los que guardamos al crear ESTA suscripción (el monto depende del dólar de ese día).
  if (info.tieneMonto && !montoCoincide(info.monto, info.moneda, sub.ars_pesos)) {
    console.error("vita+: el preapproval no coincide con lo guardado");
    return ignorarAnotando(admin, evento("monto_distinto", { usuarioId: sub.usuario_id, suscripcionId: sub.id }));
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
  const preapprovalId = info.preapprovalId;
  const pagoId = info.pagoId;
  const anotar = (motivo: string, extra: Partial<DatosNoAcreditado> = {}): DatosNoAcreditado => ({
    clave: pagoId,
    pagoId,
    preapprovalId,
    referencia: null,
    motivo,
    monto: info.monto,
    moneda: info.moneda,
    estadoMp: info.estadoPago,
    ...extra,
  });

  let encontrada = await buscarSuscripcion(admin, "preapproval_id", preapprovalId);
  if (encontrada.fallo) return REINTENTAR();
  let referencia: string | null = null;
  if (!encontrada.fila) {
    // El preapproval_id puede no estar guardado todavía (la notificación se adelantó): se relaciona por external_reference.
    if (!esIdSeguro(preapprovalId)) return ignorarAnotando(admin, anotar("suscripcion_desconocida"));
    const padre = await mp.leer(urlPreapproval(preapprovalId));
    if (padre.clase !== "ok") return respuestaFallo(padre.clase);
    referencia = leerPreapproval(padre.json)?.referenciaExterna ?? null;
    if (!referencia) return ignorarAnotando(admin, anotar("suscripcion_desconocida"));
    encontrada = await buscarSuscripcion(admin, "external_reference", referencia);
    if (encontrada.fallo) return REINTENTAR();
  }
  const sub = encontrada.fila;
  if (!sub) return ignorarAnotando(admin, anotar("suscripcion_desconocida", { referencia }));

  const decision = decidirPago(info, { preapproval_id: sub.preapproval_id ?? preapprovalId, ars_pesos: sub.ars_pesos });
  if (decision.tipo === "ignorar") {
    if (decision.motivo === "monto_distinto") console.error("vita+: el cobro no coincide con el monto guardado");
    return ignorarAnotando(admin, anotar(decision.motivo, { referencia, usuarioId: sub.usuario_id, suscripcionId: sub.id }));
  }
  if (decision.tipo === "forma_inesperada") return responder("transitorio", { error: "unexpected_shape" });

  const autorizadas = await cargarAutorizadas(admin, sub.usuario_id);
  if (!autorizadas) return REINTENTAR();
  const duplicada = planificarDuplicados(sub, autorizadas).cancelarEsta;

  // Un cobro aprobado y con el monto correcto SIEMPRE se acredita, también el de una suscripción duplicada.
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

  if (duplicada) {
    // Se cortan los cobros futuros de la duplicada (la más nueva) y se anota para decidir a mano el reembolso.
    console.error("vita+: cobro de una suscripción duplicada: se acredita y se cancela la duplicada");
    if (!(await cancelarDuplicado(admin, mp, sub.id, preapprovalId))) return REINTENTAR();
    if (!(await anotarNoAcreditado(admin, anotar("duplicada", { referencia, usuarioId: sub.usuario_id, suscripcionId: sub.id })))) {
      return REINTENTAR();
    }
    return responder("manejado", { handled: "duplicate_credited" });
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
