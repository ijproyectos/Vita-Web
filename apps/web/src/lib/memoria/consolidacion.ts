import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { BatchCreateParams } from "@anthropic-ai/sdk/resources/messages/batches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELO_RESUMEN } from "@/lib/ai/modelo";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import {
  alcanzaParaCrearLote,
  reunirPorTandas,
  armarPedidoLote,
  armarSnapshot,
  CONCURRENCIA_APLICAR,
  decidirLote,
  desdeFilaRpc,
  DIAS_RETENCION_LOTES,
  elegirRecuerdos,
  esCustomIdValido,
  interpretarResultado,
  leerSnapshot,
  LOTES_POR_POLL,
  MARGEN_APLICAR_PERSONA_MS,
  MAX_DESTACADOS,
  MAX_INTENTOS_PERSONA,
  MAX_RECLAMOS_LOTE,
  MAX_RECUERDOS_POR_PERSONA,
  MAX_TOKENS_DESTACADOS,
  MAX_USUARIOS_POR_LOTE,
  MIN_RECUERDOS_CONSOLIDAR,
  PRESUPUESTO_ENVIO_MS,
  PRESUPUESTO_POLL_MS,
  RECLAMO_VENCE_S,
  SchemaConsolidacion,
  snapshotComoMapa,
  TIMEOUT_CREAR_LOTE_MS,
  TIMEOUT_LECTURA_MS,
  validarPlan,
  type EntradaSnapshot,
  type FilaRecuerdo,
  type FilaReservada,
  type MemoriaConsolidable,
  type ResultadoPedidoCrudo,
} from "./consolidacion-logica";
import { faltaMigracion } from "./nucleo";

// Consolidación nocturna de la memoria (fase 4, migración 043) con Message Batches. Corre con service_role porque recorre a
// todas las personas con memoria activa y escribe tablas sin policies: uso de sistema sancionado (ver lib/supabase/admin.ts),
// siempre detrás de `x-cron-secret`. Cada escritura sobre los recuerdos pasa por la RPC `aplicar_consolidacion`, que vuelve a
// verificar todo (versión de cada recuerdo, memoria activa, mensajes excluidos) en una transacción.
//
// Flujo:
//  - enviar (1 vez por noche): elige personas con recuerdos nuevos, salta a las que pasaron su límite diario en dólares, las
//    RESERVA en la base (índice único: una persona en un solo lote en vuelo; el `custom_id` opaco lo genera la base), crea UN
//    lote en Anthropic y guarda su id.
//  - procesar (cada 30 min; no hace nada si no hay lote en vuelo): por cada lote pregunta si terminó; si terminó lo reclama
//    (update condicional) y aplica el resultado de cada persona. Es idempotente: la RPC solo actúa sobre filas 'enviado' y el
//    costo entra una sola vez por pedido (`marcar_uso_lote_usuario`).
//  - Errores/vencidos/cancelados: la persona queda 'error' (sin aplicar) y vuelve a ser candidata la noche siguiente.
// Nunca se loguea contenido de recuerdos ni ids de personas.

type Admin = SupabaseClient;

// SIN reintentos del SDK por defecto: un reintento de `batches.create` podría crear un segundo lote (y cobrarlo). Las lecturas
// (retrieve/results) son idempotentes y piden sus reintentos explícitos.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
const LECTURA = { maxRetries: 1, timeout: TIMEOUT_LECTURA_MS } as const;
const SELECT_USUARIO_LOTE = "usuario_id, custom_id, snapshot, estado, uso_registrado_at";

function codigoError(e: unknown): string {
  const err = e as { name?: unknown; status?: unknown } | null;
  if (err && typeof err.status === "number") return `anthropic_${err.status}`;
  if (err && err.name === "APIConnectionTimeoutError") return "timeout";
  return "interno";
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------
export type ResumenEnvio = {
  estado: "enviado" | "sin_candidatos" | "sin_migracion" | "sin_clave" | "sin_tiempo" | "error";
  candidatos: number;
  enviados: number;
  salteados: number;
};

/** Recuerdos que viajan de una persona, o null si no corresponde mandarla (límite diario superado, pocos recuerdos, falla). */
async function recuerdosDe(admin: Admin, usuarioId: string): Promise<MemoriaConsolidable[] | null> {
  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) return null;
  const { data, error } = await admin.rpc("recuerdos_para_consolidar", { p_usuario: usuarioId, p_limite: MAX_RECUERDOS_POR_PERSONA });
  if (error) return null;
  const elegidos = elegirRecuerdos(((data ?? []) as FilaRecuerdo[]).map(desdeFilaRpc));
  return elegidos.length >= MIN_RECUERDOS_CONSOLIDAR ? elegidos : null;
}

export async function enviarLoteConsolidacion(admin: Admin = createAdminClient(), opciones: { presupuestoMs?: number } = {}): Promise<ResumenEnvio> {
  const limiteMs = performance.now() + (opciones.presupuestoMs ?? PRESUPUESTO_ENVIO_MS);
  const res: ResumenEnvio = { estado: "sin_candidatos", candidatos: 0, enviados: 0, salteados: 0 };
  if (!process.env.ANTHROPIC_API_KEY) return { ...res, estado: "sin_clave" };

  try {
    const { data: cand, error: errCand } = await admin.rpc("candidatos_consolidacion", {
      p_limite: MAX_USUARIOS_POR_LOTE,
      p_minimo: MIN_RECUERDOS_CONSOLIDAR,
    });
    if (errCand) {
      if (faltaMigracion(errCand)) return { ...res, estado: "sin_migracion" };
      console.warn("consolidacion: no se pudieron elegir candidatos", errCand.code ?? "");
      return { ...res, estado: "error" };
    }
    const ids = ((cand ?? []) as { o_usuario_id?: string }[]).map((f) => f.o_usuario_id).filter((x): x is string => !!x);
    res.candidatos = ids.length;
    if (ids.length === 0) return res;

    // Solo recuerdos (nunca texto de mensajes del chat), de a tandas. Si el tiempo se acaba se manda lo que ya se juntó.
    const { reunidos: elegidosPorUsuario } = await reunirPorTandas<MemoriaConsolidable[]>(ids, (id) => recuerdosDe(admin, id), () => limiteMs - performance.now());
    res.salteados = ids.length - elegidosPorUsuario.size;
    if (elegidosPorUsuario.size === 0) return res;
    // Antes de reservar (después ya no se puede deshacer sin dejar personas en 'error'): ¿alcanza para crear el lote?
    if (!alcanzaParaCrearLote(limiteMs - performance.now())) return { ...res, estado: "sin_tiempo" };

    // 1) Reservar en la base ANTES de llamar a Anthropic: si dos envíos corren a la vez, cada persona la gana uno solo.
    const reservas = [...elegidosPorUsuario.entries()].map(([usuario_id, elegidos]) => ({ usuario_id, snapshot: armarSnapshot(elegidos) }));
    const { data: reservadas, error: errReserva } = await admin.rpc("reservar_lote_consolidacion", { p_usuarios: reservas });
    if (errReserva) {
      console.warn("consolidacion: no se pudo reservar el lote", errReserva.code ?? "");
      return { ...res, estado: "error" };
    }
    const filas = (reservadas ?? []) as FilaReservada[];
    if (filas.length === 0) return res;
    const loteId = filas[0].o_lote_id;

    // 2) Un pedido por persona reservada. custom_id opaco, generado por la base.
    const schema = zodOutputFormat(SchemaConsolidacion).schema as Record<string, unknown>;
    const requests = filas.map((f) =>
      armarPedidoLote({ customId: f.o_custom_id, modelo: MODELO_RESUMEN, elegidos: elegidosPorUsuario.get(f.o_usuario_id) ?? [], schema })
    ) as unknown as BatchCreateParams["requests"];

    let batchId: string;
    try {
      // Una sola vez, sin reintentos (ver arriba).
      batchId = (await anthropic.messages.batches.create({ requests }, { maxRetries: 0, timeout: TIMEOUT_CREAR_LOTE_MS })).id;
    } catch (e) {
      // No se creó el lote (o no se sabe: un timeout puede haberlo creado igual; en ese caso Anthropic lo corre y se cobra sin
      // aplicarse): se liberan las personas, quedan 'error' y vuelven a ser candidatas mañana.
      const codigo = codigoError(e);
      if (codigo === "timeout") console.warn("consolidacion: timeout al crear el lote; puede haber quedado un lote sin seguimiento en Anthropic");
      await cerrarLoteFallido(admin, loteId, codigo);
      return { ...res, estado: "error" };
    }
    if (!(await guardarBatchId(admin, loteId, batchId))) {
      // El lote existe y se cobra pero no quedó atado a la base: el id va como código del cierre para no perderlo.
      console.error("consolidacion: lote huérfano en Anthropic; no se pudo guardar su id en la base");
      await cerrarLoteFallido(admin, loteId, `batch_id_sin_guardar:${batchId}`);
      return { ...res, estado: "error" };
    }
    return { ...res, estado: "enviado", enviados: filas.length };
  } catch {
    console.warn("consolidacion: falló el envío");
    return { ...res, estado: "error" };
  }
}

async function guardarBatchId(admin: Admin, loteId: string, batchId: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const { error } = await admin.from("lotes_consolidacion").update({ batch_id: batchId }).eq("id", loteId);
    if (!error) return true;
  }
  return false;
}

/**
 * Lote fallido, ATÓMICO (RPC `cerrar_lote_consolidacion`): las personas que seguían 'enviado' pasan a 'error' (vuelven a ser
 * candidatas la noche siguiente) y el lote queda 'fallido' en la misma transacción. Si la RPC falla se loguea y el lote sigue
 * abierto (el tope de edad lo vuelve a intentar cerrar en el próximo poll).
 */
async function cerrarLoteFallido(admin: Admin, loteId: string, codigo: string): Promise<boolean> {
  try {
    const { error } = await admin.rpc("cerrar_lote_consolidacion", { p_lote: loteId, p_error: codigo });
    if (error) {
      console.warn("consolidacion: no se pudo cerrar el lote fallido", error.code ?? "");
      return false;
    }
    return true;
  } catch {
    console.warn("consolidacion: no se pudo cerrar el lote fallido");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Poll y aplicación
// ---------------------------------------------------------------------------
export type ResumenProceso = {
  lotes: number;
  terminados: number;
  aplicados: number;
  errores: number;
  unidos: number;
  destacados: number;
  contradicciones: number;
  estado?: "sin_migracion" | "sin_clave";
};

type FilaLote = { id: string; batch_id: string | null; estado: "enviado" | "terminado"; created_at: string };
type FilaLoteUsuario = { usuario_id: string; custom_id: string; snapshot: unknown; estado: string; uso_registrado_at: string | null };

export async function procesarLotesConsolidacion(admin: Admin = createAdminClient(), opciones: { presupuestoMs?: number } = {}): Promise<ResumenProceso> {
  const limiteMs = performance.now() + (opciones.presupuestoMs ?? PRESUPUESTO_POLL_MS);
  const resumen: ResumenProceso = { lotes: 0, terminados: 0, aplicados: 0, errores: 0, unidos: 0, destacados: 0, contradicciones: 0 };

  try {
    const { data, error } = await admin
      .from("lotes_consolidacion")
      .select("id, batch_id, estado, created_at")
      .in("estado", ["enviado", "terminado"])
      // Los menos reintentados primero: un lote atascado no desplaza a los nuevos (y su tope de reclamos lo cierra).
      .order("intentos", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(LOTES_POR_POLL);
    if (error) {
      if (faltaMigracion(error)) resumen.estado = "sin_migracion";
      else console.warn("consolidacion: no se pudieron leer los lotes", error.code ?? "");
      return resumen;
    }
    const lotes = (data ?? []) as FilaLote[];

    // Nada en vuelo: el caso común del cron de cada 30 minutos. Solo la limpieza de retención y listo.
    if (lotes.length === 0 || !process.env.ANTHROPIC_API_KEY) {
      if (lotes.length > 0) resumen.estado = "sin_clave";
      else await admin.rpc("limpiar_lotes_consolidacion", { p_dias: DIAS_RETENCION_LOTES });
      return resumen;
    }

    for (const lote of lotes) {
      if (limiteMs - performance.now() < 3_000) break;
      resumen.lotes++;
      const decision = decidirLote({ batchId: lote.batch_id, estado: lote.estado, edadMs: Date.now() - new Date(lote.created_at).getTime() });
      if (decision === "esperar") continue;
      if (decision === "cerrar_huerfano") {
        await cerrarLoteFallido(admin, lote.id, "sin_lote_remoto");
        continue;
      }
      if (decision === "cerrar_vencido") {
        await facturarLoteAbandonado(admin, lote.id, lote.batch_id as string);
        await cerrarLoteFallido(admin, lote.id, lote.estado === "enviado" ? "lote_vencido" : "reintentos_agotados");
        continue;
      }
      const batchId = lote.batch_id as string;

      // Un lote 'terminado' ya se vio terminar en un poll anterior: no se vuelve a preguntar.
      if (lote.estado === "enviado") {
        let terminado = false;
        try {
          terminado = (await anthropic.messages.batches.retrieve(batchId, LECTURA)).processing_status === "ended";
        } catch (e) {
          console.warn("consolidacion: no se pudo consultar el lote", codigoError(e));
        }
        if (!terminado) continue;
      }

      // Reclamo (RPC): solo un poll gana el lote y se cuenta el intento. Un reclamo vencido (el poll anterior murió o se quedó
      // sin tiempo) se retoma, pero solo hasta MAX_RECLAMOS_LOTE veces: después las personas pasan a 'error' y el lote a
      // 'fallido' (vuelven a ser candidatas la noche siguiente).
      const { data: rec, error: errReclamo } = await admin.rpc("reclamar_lote_consolidacion", { p_id: lote.id, p_reclamo_vence_s: RECLAMO_VENCE_S });
      if (errReclamo) continue;
      const fila = (Array.isArray(rec) ? rec[0] : rec) as { o_reclamado?: boolean; o_intentos?: number } | undefined;
      if (!fila?.o_reclamado) continue;
      if ((fila.o_intentos ?? 0) > MAX_RECLAMOS_LOTE) {
        await facturarLoteAbandonado(admin, lote.id, batchId);
        await cerrarLoteFallido(admin, lote.id, "reintentos_agotados");
        continue;
      }

      resumen.terminados++;
      await aplicarLote(admin, lote.id, batchId, limiteMs, resumen);
    }
  } catch {
    console.warn("consolidacion: falló el procesamiento");
  }
  return resumen;
}

type ItemLote = { custom_id: string; result: ResultadoPedidoCrudo };

async function aplicarLote(admin: Admin, loteId: string, batchId: string, limiteMs: number, resumen: ResumenProceso): Promise<void> {
  const { data, error } = await admin.from("lote_usuarios").select(SELECT_USUARIO_LOTE).eq("lote_id", loteId);
  if (error) return;
  // Quien sigue 'enviado' se aplica; quien se descartó (olvidó todo, apagó la memoria) igual se cobró: su costo entra al límite.
  const trabajo = ((data ?? []) as FilaLoteUsuario[]).filter((f) => esCustomIdValido(f.custom_id) && (f.estado === "enviado" || f.uso_registrado_at === null));

  const resultados = new Map<string, ItemLote>();
  let streamCompleto = false;
  if (trabajo.length > 0) {
    const conocidos = new Set(trabajo.map((f) => f.custom_id));
    try {
      // Los resultados llegan en CUALQUIER orden: se indexan por custom_id. Los ids que no son de este lote se ignoran.
      for await (const item of await anthropic.messages.batches.results(batchId, LECTURA)) {
        if (conocidos.has(item.custom_id)) resultados.set(item.custom_id, item as unknown as ItemLote);
      }
      streamCompleto = true;
    } catch (e) {
      console.warn("consolidacion: no se pudieron leer los resultados", codigoError(e));
      // Lo que sí se alcanzó a leer ya se gastó: se cobra ahora (una sola vez por pedido) aunque el resto se reintente.
      await facturarLeidos(admin, loteId, trabajo, resultados);
      return; // el reclamo vence y otro poll lo retoma
    }
  }

  let siguiente = 0;
  async function trabajador(): Promise<void> {
    while (siguiente < trabajo.length && limiteMs - performance.now() > MARGEN_APLICAR_PERSONA_MS) {
      const fila = trabajo[siguiente++];
      try {
        await aplicarUsuario(admin, loteId, fila, resultados.get(fila.custom_id), streamCompleto, resumen);
      } catch {
        console.warn("consolidacion: falló la aplicación de una persona");
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA_APLICAR }, trabajador));

  // La RPC solo cierra si ya nadie quedó 'enviado' ('abierto' = sigue): un lote nunca se cierra con personas sin resolver. Si
  // faltó tiempo, el lote sigue 'terminado' y se retoma cuando venza el reclamo.
  const { error: errCierre } = await admin.rpc("cerrar_lote_consolidacion", { p_lote: loteId, p_error: null });
  if (errCierre) console.warn("consolidacion: no se pudo cerrar el lote", errCierre.code ?? "");
}

/** Cobra el uso de los pedidos exitosos ya leídos (idempotente: `marcar_uso_lote_usuario` deja pasar a uno solo). */
async function facturarLeidos(admin: Admin, loteId: string, filas: FilaLoteUsuario[], resultados: Map<string, ItemLote>): Promise<void> {
  for (const fila of filas) {
    const item = resultados.get(fila.custom_id);
    if (!item) continue;
    const r = interpretarResultado(item.result);
    if (r.tipo === "plan" || r.tipo === "invalido") await contabilizarUso(admin, loteId, fila.usuario_id, r.uso);
  }
}

/**
 * Antes de dar un lote por perdido (reclamos agotados / vencido) se intenta UNA lectura más de sus resultados para cobrar lo que
 * Anthropic ya procesó. Si tampoco se puede, queda un error claro en el log: el gasto de ese lote no entró al límite diario.
 */
async function facturarLoteAbandonado(admin: Admin, loteId: string, batchId: string): Promise<void> {
  try {
    const { data, error } = await admin.from("lote_usuarios").select(SELECT_USUARIO_LOTE).eq("lote_id", loteId).is("uso_registrado_at", null);
    if (error) throw new Error("db");
    const filas = ((data ?? []) as FilaLoteUsuario[]).filter((f) => esCustomIdValido(f.custom_id));
    if (filas.length === 0) return;
    const conocidos = new Set(filas.map((f) => f.custom_id));
    const resultados = new Map<string, ItemLote>();
    for await (const item of await anthropic.messages.batches.results(batchId, LECTURA)) {
      if (conocidos.has(item.custom_id)) resultados.set(item.custom_id, item as unknown as ItemLote);
    }
    await facturarLeidos(admin, loteId, filas, resultados);
  } catch (e) {
    console.error("consolidacion: lote cerrado sin poder leer sus resultados; su gasto NO entró al límite diario", codigoError(e));
  }
}

async function marcarError(admin: Admin, loteId: string, usuarioId: string, codigo: string): Promise<boolean> {
  const { data, error } = await admin.rpc("marcar_error_lote_usuario", { p_lote: loteId, p_usuario: usuarioId, p_codigo: codigo });
  return !error && data === true;
}

/**
 * Costo REAL del pedido, con precio de lote (50 %), en el límite diario de la persona. Una sola vez por pedido: la marca se
 * pone ANTES de registrar (ante una caída en el medio se cobra de menos, nunca dos veces).
 */
async function contabilizarUso(admin: Admin, loteId: string, usuarioId: string, uso: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): Promise<void> {
  const { data, error } = await admin.rpc("marcar_uso_lote_usuario", { p_lote: loteId, p_usuario: usuarioId });
  if (error || data !== true) return;
  await registrarUsoIA(usuarioId, { modelo: MODELO_RESUMEN, ...uso, lote: true });
}

async function aplicarUsuario(
  admin: Admin,
  loteId: string,
  fila: FilaLoteUsuario,
  item: ItemLote | undefined,
  streamCompleto: boolean,
  resumen: ResumenProceso
): Promise<void> {
  const usuarioId = fila.usuario_id;
  const sigueEnviado = fila.estado === "enviado";
  if (!item) {
    // El stream terminó y no trajo a esta persona: se reintenta mañana.
    if (sigueEnviado && streamCompleto && (await marcarError(admin, loteId, usuarioId, "sin_resultado"))) resumen.errores++;
    return;
  }

  const r = interpretarResultado(item.result);
  if (r.tipo === "sin_respuesta") {
    // Errored / expired / canceled: no hubo respuesta ni gasto. La persona vuelve a ser candidata la noche siguiente.
    if (sigueEnviado && (await marcarError(admin, loteId, usuarioId, r.codigo))) resumen.errores++;
    return;
  }

  // Lo que se gastó se cobra siempre, aunque la salida no sirva o la persona haya olvidado todo mientras corría el lote.
  await contabilizarUso(admin, loteId, usuarioId, r.uso);
  if (!sigueEnviado) return;

  if (r.tipo === "invalido") {
    if (await marcarError(admin, loteId, usuarioId, r.codigo)) resumen.errores++;
    return;
  }

  const snapshot = leerSnapshot(fila.snapshot);
  if (!snapshot) {
    if (await marcarError(admin, loteId, usuarioId, "plan_invalido")) resumen.errores++;
    return;
  }

  // Los recuerdos tal como se mandaron (la posición en el snapshot es la referencia m<N> que vio el modelo). Solo se usan para
  // resolver referencias y chequear que dos recuerdos sean de la misma persona; el estado vigente lo vuelve a verificar la RPC.
  const enviados = await cargarEnviados(admin, usuarioId, snapshot);
  if (!enviados) return intentoFallido(admin, loteId, usuarioId, resumen); // error de lectura: se reintenta, con tope
  const plan = validarPlan(r.crudo, enviados);
  if (!plan) {
    if (await marcarError(admin, loteId, usuarioId, "plan_invalido")) resumen.errores++;
    return;
  }

  const { data, error: errAplicar } = await admin.rpc("aplicar_consolidacion", {
    p_lote: loteId,
    p_usuario: usuarioId,
    p_plan: plan,
    p_snapshot: snapshotComoMapa(snapshot),
    p_max_destacados: MAX_DESTACADOS,
    p_max_tokens_destacados: MAX_TOKENS_DESTACADOS,
  });
  if (errAplicar) {
    console.warn("consolidacion: no se pudo aplicar el plan", errAplicar.code ?? "");
    return intentoFallido(admin, loteId, usuarioId, resumen); // se reintenta en el próximo poll, con tope
  }
  const a = (Array.isArray(data) ? data[0] : data) as { o_estado?: string; o_unidos?: number; o_destacados?: number; o_contradicciones?: number } | undefined;
  if (a?.o_estado === "aplicado") {
    resumen.aplicados++;
    resumen.unidos += a.o_unidos ?? 0;
    resumen.destacados += a.o_destacados ?? 0;
    resumen.contradicciones += a.o_contradicciones ?? 0;
  }
}

/** Falla transitoria de una persona: suma el intento y, pasado el tope, queda 'error' (candidata de nuevo la noche siguiente). */
async function intentoFallido(admin: Admin, loteId: string, usuarioId: string, resumen: ResumenProceso): Promise<void> {
  const { data, error } = await admin.rpc("intento_fallido_lote_usuario", {
    p_lote: loteId,
    p_usuario: usuarioId,
    p_max: MAX_INTENTOS_PERSONA,
    p_codigo: "reintentos_agotados",
  });
  if (!error && data === true) resumen.errores++;
}

const COLUMNAS_MEMORIA = "id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, destacado, usos, updated_at, created_at";

async function cargarEnviados(admin: Admin, usuarioId: string, snapshot: EntradaSnapshot[]): Promise<MemoriaConsolidable[] | null> {
  const { data, error } = await admin
    .from("memorias")
    .select(COLUMNAS_MEMORIA)
    .eq("usuario_id", usuarioId)
    .in("id", snapshot.map((e) => e.id));
  if (error) return null;
  const porId = new Map(((data ?? []) as MemoriaConsolidable[]).map((m) => [m.id, m]));
  // Una referencia cuyo recuerdo ya no existe se vuelve un marcador inválido (tipo 'pasajero'): ningún ítem lo puede usar.
  return snapshot.map(
    (e) =>
      porId.get(e.id) ?? {
        id: e.id,
        sobre_tipo: "yo",
        sobre_perfil_id: null,
        sobre_nombre: null,
        clave: "",
        texto: null,
        tipo: "pasajero",
        destacado: false,
        usos: 0,
        updated_at: e.u,
        created_at: e.u,
      }
  );
}
