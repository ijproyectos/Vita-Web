import { createHmac, timingSafeEqual } from "node:crypto";

// Lógica PURA de servidor de vita+ (sin red ni base): firma del webhook, lectura de recursos de Mercado Pago,
// decisión de si un pago otorga vita+, validaciones de URLs y de origen. Diseño portado de la integración de
// Moni (Edge Functions) a Node. Los montos son pesos ENTEROS (los de `vita_plus_suscripciones.ars_pesos`).

// --- Estados ---------------------------------------------------------------------------------------------

export type EstadoMp = "pending" | "authorized" | "paused" | "cancelled";

/** Estado de Mercado Pago -> el nuestro. Valor desconocido = null (nunca se adivina). Acepta las dos grafías. */
export function estadoDesdeMp(valor: unknown): EstadoMp | null {
  switch (valor) {
    case "pending":
    case "authorized":
    case "paused":
      return valor;
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return null;
  }
}

// --- Origen ----------------------------------------------------------------------------------------------

/** Mismo-origen: sin `Origin` pasa (no es un navegador cross-site); con `Origin` el host tiene que ser el público. */
export function origenPermitido(origen: string | null, hostPublico: string | null): boolean {
  if (!origen) return true;
  try {
    const host = new URL(origen).host;
    return host !== "" && host === hostPublico;
  } catch {
    return false;
  }
}

// --- back_url e init_point -------------------------------------------------------------------------------

export const RUTA_GRACIAS = "/app/vita-plus/gracias";
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

/** back_url para Mercado Pago: origen de NEXT_PUBLIC_SITE_URL + ruta de gracias. HTTPS (http solo en localhost). */
export function construirBackUrl(sitio: string | undefined | null): string | null {
  if (!sitio) return null;
  let url: URL;
  try {
    url = new URL(sitio.trim());
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  const local = HOSTS_LOCALES.has(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  return `${url.origin}${RUTA_GRACIAS}`;
}

/** https en mercadopago.com o mercadopago.com.ar (o subdominio), sin credenciales ni puerto. */
export function esInitPointMp(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "" || url.port !== "") return false;
  return /^(?:[a-z0-9-]+\.)*mercadopago\.com(?:\.ar)?$/.test(url.hostname);
}

// --- Cuerpo del preapproval -----------------------------------------------------------------------------

export interface OfertaSuscripcion {
  razon: string;
  meses: number;
  pesos: number;
}

export interface EntradaPreapproval {
  oferta: OfertaSuscripcion;
  referenciaExterna: string;
  emailPagador: string;
  backUrl: string;
}

/** Cuerpo de POST /preapproval sin plan asociado (checkout elige el medio de pago en Mercado Pago). */
export function construirCuerpoPreapproval(e: EntradaPreapproval) {
  return {
    reason: e.oferta.razon,
    external_reference: e.referenciaExterna,
    payer_email: e.emailPagador,
    auto_recurring: {
      frequency: e.oferta.meses,
      frequency_type: "months" as const,
      transaction_amount: e.oferta.pesos,
      currency_id: "ARS" as const,
    },
    back_url: e.backUrl,
    status: "pending" as const,
  };
}

/** Pesos y moneda iguales a lo guardado. Los montos se comparan en centavos para evitar ruido de float. */
export function montoCoincide(monto: unknown, moneda: unknown, pesosEsperados: number): boolean {
  if (typeof monto !== "number" || !Number.isFinite(monto)) return false;
  if (typeof moneda !== "string" || moneda.toUpperCase() !== "ARS") return false;
  return Math.round(monto * 100) === Math.round(pesosEsperados * 100);
}

// --- Notificación y firma -------------------------------------------------------------------------------

export const TOPIC_PREAPPROVAL = "subscription_preapproval";
export const TOPIC_PAGO_AUTORIZADO = "subscription_authorized_payment";
export type TopicSoportado = typeof TOPIC_PREAPPROVAL | typeof TOPIC_PAGO_AUTORIZADO;

export function topicSoportado(tipo: unknown): TopicSoportado | null {
  return tipo === TOPIC_PREAPPROVAL || tipo === TOPIC_PAGO_AUTORIZADO ? tipo : null;
}

export const MAX_BYTES_WEBHOOK = 8 * 1024;
const ID_SEGURO = /^[A-Za-z0-9_-]{1,100}$/;

/** Los ids van en un path de URL: solo este alfabeto. */
export function esIdSeguro(valor: unknown): valor is string {
  return typeof valor === "string" && ID_SEGURO.test(valor);
}

export interface Notificacion {
  tipo: string | null;
  dataId: string | null;
}

/** El cuerpo no es confiable: solo dice QUÉ recurso volver a pedir. */
export function leerNotificacion(cuerpo: unknown): Notificacion {
  if (typeof cuerpo !== "object" || cuerpo === null) return { tipo: null, dataId: null };
  const { type, data } = cuerpo as { type?: unknown; data?: unknown };
  let dataId: string | null = null;
  if (typeof data === "object" && data !== null) {
    const id = (data as { id?: unknown }).id;
    if (typeof id === "string" && id !== "") dataId = id;
    else if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) dataId = String(id);
  }
  return { tipo: typeof type === "string" ? type : null, dataId };
}

/** Antigüedad máxima del `ts` firmado: 24 h (Mercado Pago reintenta ~24 h). Reintentos inocuos: todo es idempotente. */
export const TOLERANCIA_TS_MS = 24 * 60 * 60 * 1000;
/** Un `ts` en el futuro solo se perdona hasta 5 minutos de reloj corrido. */
export const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

export interface FirmaLeida {
  ts: string;
  v1: string;
}

export function leerCabeceraFirma(cabecera: string | null | undefined): FirmaLeida | null {
  if (!cabecera || cabecera.length > 512) return null;
  const partes: Record<string, string> = {};
  for (const pieza of cabecera.split(",")) {
    const i = pieza.indexOf("=");
    if (i <= 0) continue;
    partes[pieza.slice(0, i).trim()] = pieza.slice(i + 1).trim();
  }
  const { ts, v1 } = partes;
  if (!ts || !v1) return null;
  if (!/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { ts, v1: v1.toLowerCase() };
}

export function construirManifiesto(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

export function calcularFirma(secreto: string, manifiesto: string): string {
  return createHmac("sha256", secreto).update(manifiesto).digest("hex");
}

/** Comparación en tiempo constante de dos hex de igual largo. */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** `ts` en milisegundos (un valor menor a 1e12 se lee como segundos). */
export function tsReciente(ts: string, ahoraMs: number): boolean {
  const crudo = Number(ts);
  if (!Number.isFinite(crudo) || crudo <= 0) return false;
  const ms = crudo < 1e12 ? crudo * 1000 : crudo;
  const edad = ahoraMs - ms;
  return edad <= TOLERANCIA_TS_MS && edad >= -TOLERANCIA_FUTURO_MS;
}

export type ResultadoFirma =
  | { ok: true; dataId: string }
  | { ok: false; motivo: "falta" | "malformada" | "vieja" | "no_coincide" };

export interface EntradaFirma {
  secreto: string;
  cabecera: string | null;
  requestId: string | null;
  /** `data.id` candidatos (cuerpo, query string). Gana el que coincide con la firma. */
  dataIds: ReadonlyArray<string | null>;
  ahoraMs: number;
}

export function verificarFirmaWebhook(e: EntradaFirma): ResultadoFirma {
  const candidatos = [...new Set(e.dataIds.filter((id): id is string => !!id))];
  if (!e.cabecera || !e.requestId || candidatos.length === 0) return { ok: false, motivo: "falta" };
  const firma = leerCabeceraFirma(e.cabecera);
  if (!firma) return { ok: false, motivo: "malformada" };
  if (!tsReciente(firma.ts, e.ahoraMs)) return { ok: false, motivo: "vieja" };
  for (const dataId of candidatos) {
    const esperada = calcularFirma(e.secreto, construirManifiesto(dataId, e.requestId, firma.ts));
    if (igualesEnTiempoConstante(esperada, firma.v1)) return { ok: true, dataId };
  }
  return { ok: false, motivo: "no_coincide" };
}

// --- Recursos re-pedidos a Mercado Pago -----------------------------------------------------------------

export interface PreapprovalLeido {
  id: string;
  estado: EstadoMp | null;
  referenciaExterna: string | null;
  /** null si Mercado Pago no incluyó auto_recurring. */
  monto: unknown;
  moneda: unknown;
  tieneMonto: boolean;
}

export function leerPreapproval(json: unknown): PreapprovalLeido | null {
  if (typeof json !== "object" || json === null) return null;
  const { id, status, external_reference, auto_recurring } = json as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return null;
  let monto: unknown = null;
  let moneda: unknown = null;
  let tieneMonto = false;
  if (typeof auto_recurring === "object" && auto_recurring !== null) {
    const ar = auto_recurring as Record<string, unknown>;
    monto = ar.transaction_amount;
    moneda = ar.currency_id;
    tieneMonto = true;
  }
  return {
    id,
    estado: estadoDesdeMp(status),
    referenciaExterna: typeof external_reference === "string" ? external_reference : null,
    monto,
    moneda,
    tieneMonto,
  };
}

export interface PagoAutorizadoLeido {
  preapprovalId: string | null;
  monto: unknown;
  moneda: unknown;
  pagoId: string | null;
  estadoPago: string | null;
}

/**
 * GET /authorized_payments/{id}. Los campos esperados (preapproval_id, transaction_amount, currency_id,
 * payment.id, payment.status) hay que confirmarlos con un pago real de prueba; lo que no encaje se informa
 * como `forma_inesperada` (503, se reintenta) en vez de adivinarse.
 */
export function leerPagoAutorizado(json: unknown): PagoAutorizadoLeido | null {
  if (typeof json !== "object" || json === null) return null;
  const { preapproval_id, transaction_amount, currency_id, payment } = json as Record<string, unknown>;
  let pagoId: string | null = null;
  let estadoPago: string | null = null;
  if (typeof payment === "object" && payment !== null) {
    const { id, status } = payment as Record<string, unknown>;
    if (typeof id === "string" && id !== "") pagoId = id;
    else if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) pagoId = String(id);
    if (typeof status === "string") estadoPago = status;
  }
  return {
    preapprovalId: typeof preapproval_id === "string" && preapproval_id !== "" ? preapproval_id : null,
    monto: transaction_amount,
    moneda: currency_id,
    pagoId,
    estadoPago,
  };
}

export interface SuscripcionGuardada {
  id: string;
  usuario_id: string;
  preapproval_id: string | null;
  ars_pesos: number;
  creada_at: string;
}

export type DecisionPago =
  | { tipo: "otorgar"; pagoId: string; pesos: number }
  | { tipo: "ignorar"; motivo: "no_aprobado" | "monto_distinto" | "otra_suscripcion" }
  | { tipo: "forma_inesperada" };

/**
 * ¿Este pago autorizado otorga vita+? Solo si está APROBADO y su monto/moneda son EXACTAMENTE los que
 * guardamos al crear esa suscripción (el monto en pesos depende del dólar de ese día, no es una constante).
 */
export function decidirPago(info: PagoAutorizadoLeido, sub: Pick<SuscripcionGuardada, "preapproval_id" | "ars_pesos">): DecisionPago {
  if (info.estadoPago !== "approved") return { tipo: "ignorar", motivo: "no_aprobado" };
  if (!info.preapprovalId || !info.pagoId || typeof info.monto !== "number" || typeof info.moneda !== "string") {
    return { tipo: "forma_inesperada" };
  }
  if (sub.preapproval_id !== info.preapprovalId) return { tipo: "ignorar", motivo: "otra_suscripcion" };
  if (!montoCoincide(info.monto, info.moneda, sub.ars_pesos)) return { tipo: "ignorar", motivo: "monto_distinto" };
  return { tipo: "otorgar", pagoId: info.pagoId, pesos: sub.ars_pesos };
}

// --- Suscripciones duplicadas (defensa contra doble cobro) ---------------------------------------------

export interface RefAutorizada {
  id: string;
  preapproval_id: string | null;
  creada_at: string;
}

export interface PlanDuplicados {
  cancelarEsta: boolean;
  cancelarOtras: RefAutorizada[];
}

function esMasVieja(a: { id: string; creada_at: string }, b: { id: string; creada_at: string }): boolean {
  const delta = Date.parse(a.creada_at) - Date.parse(b.creada_at);
  return delta !== 0 ? delta < 0 : a.id < b.id;
}

/** Se queda la suscripción autorizada MÁS VIEJA de la persona; las más nuevas son duplicados. */
export function planificarDuplicados(
  sujeto: { id: string; creada_at: string },
  autorizadas: ReadonlyArray<RefAutorizada>
): PlanDuplicados {
  const otras = autorizadas.filter((r) => r.id !== sujeto.id);
  if (otras.some((r) => esMasVieja(r, sujeto))) return { cancelarEsta: true, cancelarOtras: [] };
  return { cancelarEsta: false, cancelarOtras: otras.filter((r) => esMasVieja(sujeto, r)) };
}

// --- Clasificación de fallos y respuestas ---------------------------------------------------------------

export type ClaseFetchMp = "ok" | "transitorio" | "config" | "permanente";

/** 0 = error de red/timeout. 404 cuenta como transitorio (la notificación puede adelantarse al recurso). */
export function clasificarFetchMp(status: number): ClaseFetchMp {
  if (status >= 200 && status < 300) return "ok";
  if (status === 0 || status === 404 || status === 408 || status === 429 || status >= 500) return "transitorio";
  if (status === 401 || status === 403) return "config";
  return "permanente";
}

/** HTTP hacia Mercado Pago: 2xx corta los reintentos, 5xx los provoca. */
export function httpWebhook(tipo: "manejado" | "ignorado" | "transitorio" | "config"): number {
  switch (tipo) {
    case "manejado":
    case "ignorado":
      return 200;
    case "transitorio":
      return 503;
    case "config":
      return 500;
  }
}

export interface FalloApi {
  http: number;
  codigo: string;
  mensaje: string;
}

/** Fallos de `iniciar_suscripcion_vita_plus` -> error estable para la UI. */
export function clasificarErrorRpc(error: { message?: string } | null): FalloApi {
  const mensaje = error?.message ?? "";
  if (mensaje.includes("already_subscribed")) {
    return { http: 409, codigo: "ya_suscripto", mensaje: "Ya tenés una suscripción de vita+ activa." };
  }
  if (mensaje.includes("create_throttled")) {
    return { http: 429, codigo: "demasiados_pedidos", mensaje: "Esperá un minuto antes de volver a intentarlo." };
  }
  return { http: 500, codigo: "error", mensaje: "No pudimos iniciar la suscripción. Probá de nuevo." };
}

/** Estado HTTP de Mercado Pago -> error estable. Los cuerpos nunca se exponen. */
export function clasificarFalloMp(status: number): FalloApi {
  if (status === 0 || status === 429 || status >= 500) {
    return { http: 502, codigo: "proveedor_no_disponible", mensaje: "Mercado Pago no responde ahora. Probá en unos minutos." };
  }
  return { http: 502, codigo: "proveedor_error", mensaje: "Mercado Pago no pudo crear la suscripción. Probá de nuevo." };
}
