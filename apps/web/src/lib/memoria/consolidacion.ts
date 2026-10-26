import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELO_RESUMEN } from "@/lib/ai/modelo";
import { registrarRespuestaChat } from "@/lib/chat/registros";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarUsoIA } from "@/lib/uso-ia/nucleo";
import {
  armarPromptConsolidacion,
  armarSnapshot,
  customIdDe,
  elegirRecuerdos,
  extraerJson,
  leerSnapshot,
  MAX_DESTACADOS,
  MAX_TOKENS_CONSOLIDACION,
  MAX_TOKENS_DESTACADOS,
  MAX_USUARIOS_POR_LOTE,
  MIN_RECUERDOS_CONSOLIDAR,
  SchemaConsolidacion,
  SISTEMA_CONSOLIDACION,
  snapshotComoMapa,
  tokensFacturables,
  validarPlan,
  VERSION_PROMPT_CONSOLIDACION,
  type EntradaSnapshot,
  type MemoriaConsolidable,
} from "./consolidacion-logica";
import { faltaMigracion } from "./nucleo";

// Consolidación nocturna de la memoria (M7) con Message Batches. Corre con service_role porque recorre a todas las
// personas con memoria activa y escribe tablas sin policies: uso de sistema sancionado (ver lib/supabase/admin.ts), siempre
// detrás del secreto del cron. Cada escritura sobre los recuerdos pasa por la RPC `aplicar_consolidacion` (039).
//
// Flujo:
//  - enviar (1 vez por día): marca los pasajeros vencidos, elige personas con recuerdos nuevos, las RESERVA en la base
//    (índice único: una persona en un solo lote en vuelo), crea UN lote en Anthropic y guarda su id.
//  - procesar (cada 15 min): archiva pasajeros vencidos; por cada lote en vuelo pregunta si terminó; si terminó lo reclama
//    (update condicional) y aplica el resultado de cada persona con la RPC. Es idempotente: la RPC solo actúa sobre filas
//    'enviado', así que un segundo poll (o uno que retoma un reclamo vencido) no repite nada ni cobra dos veces.
//  - Errores/vencidos/cancelados del lote: la persona queda 'error' (sin aplicar) y vuelve a ser candidata la noche siguiente.

type Admin = SupabaseClient;

// Los reintentos del SDK sirven acá (el create es idempotente por reserva previa); timeout corto para no colgar al cron.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 30_000 });

/** Un reclamo de lote 'terminado' que lleva más que esto se considera abandonado y otro poll lo retoma. */
const RECLAMO_VENCE_MS = 10 * 60_000;
/** Un lote que no terminó en este tiempo (el máximo de Anthropic es 24 h) se da por fallido. */
const LOTE_VENCE_MS = 30 * 3600_000;
/** Un lote sin id de Anthropic (se cayó entre reservar y crear) se limpia pasado este tiempo. */
const LOTE_HUERFANO_MS = 60 * 60_000;
const CONCURRENCIA_APLICAR = 5;
export const PRESUPUESTO_PROCESAR_MS = 40_000;

export type ResumenEnvio =
  | { estado: "sin_migracion" | "sin_candidatos" | "error" | "sin_clave"; candidatos: number; enviados: number; vencidos: number }
  | { estado: "enviado"; candidatos: number; enviados: number; vencidos: number };

const COLUMNAS_MEMORIA = "id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, destacado, usos, updated_at, created_at";

async function marcarVencidos(admin: Admin): Promise<number> {
  try {
    const { data, error } = await admin.rpc("marcar_pasajeros_vencidos");
    if (error) {
      if (!faltaMigracion(error)) console.warn("consolidacion: no se pudieron archivar los pasajeros vencidos", error.code ?? "");
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------
export async function enviarLoteConsolidacion(admin: Admin = createAdminClient()): Promise<ResumenEnvio> {
  const vencidos = await marcarVencidos(admin);
  const base = { candidatos: 0, enviados: 0, vencidos };
  if (!process.env.ANTHROPIC_API_KEY) return { estado: "sin_clave", ...base };

  try {
    const { data: cand, error: errCand } = await admin.rpc("candidatos_consolidacion", {
      p_limite: MAX_USUARIOS_POR_LOTE,
      p_minimo: MIN_RECUERDOS_CONSOLIDAR,
    });
    if (errCand) {
      if (faltaMigracion(errCand)) return { estado: "sin_migracion", ...base };
      console.warn("consolidacion: no se pudieron elegir candidatos", errCand.code ?? "");
      return { estado: "error", ...base };
    }
    const ids = ((cand ?? []) as { o_usuario_id?: string }[]).map((f) => f.o_usuario_id).filter((x): x is string => !!x);
    if (ids.length === 0) return { estado: "sin_candidatos", ...base };

    // Recuerdos vigentes de cada persona (solo recuerdos: nunca texto de mensajes del chat).
    const elegidosPorUsuario = new Map<string, MemoriaConsolidable[]>();
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(
        ids.slice(i, i + 10).map(async (usuarioId) => {
          const { data, error } = await admin
            .from("memorias")
            .select(COLUMNAS_MEMORIA)
            .eq("usuario_id", usuarioId)
            .eq("estado", "vigente")
            .eq("tipo", "estable")
            .limit(500);
          if (error) return;
          const elegidos = elegirRecuerdos((data ?? []) as MemoriaConsolidable[]);
          if (elegidos.length >= MIN_RECUERDOS_CONSOLIDAR) elegidosPorUsuario.set(usuarioId, elegidos);
        })
      );
    }
    if (elegidosPorUsuario.size === 0) return { estado: "sin_candidatos", candidatos: ids.length, enviados: 0, vencidos };

    const reservas = [...elegidosPorUsuario.entries()].map(([usuarioId, elegidos]) => ({
      usuario_id: usuarioId,
      custom_id: customIdDe(usuarioId),
      snapshot: armarSnapshot(elegidos),
    }));

    // 1) Reservar en la base ANTES de llamar a Anthropic: si dos envíos corren a la vez, cada persona la gana uno solo.
    const { data: reservadas, error: errReserva } = await admin.rpc("reservar_lote_consolidacion", { p_usuarios: reservas });
    if (errReserva) {
      console.warn("consolidacion: no se pudo reservar el lote", errReserva.code ?? "");
      return { estado: "error", candidatos: ids.length, enviados: 0, vencidos };
    }
    const filas = (reservadas ?? []) as { o_lote_id: string; o_usuario_id: string; o_custom_id: string }[];
    if (filas.length === 0) return { estado: "sin_candidatos", candidatos: ids.length, enviados: 0, vencidos };
    const loteId = filas[0].o_lote_id;

    // 2) Un pedido por persona reservada.
    const formato = zodOutputFormat(SchemaConsolidacion);
    const requests: Anthropic.Messages.BatchCreateParams.Request[] = filas.map((f) => ({
      custom_id: f.o_custom_id,
      params: {
        model: MODELO_RESUMEN,
        max_tokens: MAX_TOKENS_CONSOLIDACION,
        system: SISTEMA_CONSOLIDACION,
        messages: [{ role: "user", content: armarPromptConsolidacion(elegidosPorUsuario.get(f.o_usuario_id) ?? []) }],
        // Haiku 5.5: razonamiento adaptativo prendido por defecto (effort "low"); sin temperature/top_p. El formato
        // estructurado ayuda, pero igual se valida todo del lado del servidor.
        output_config: { effort: "low", format: { type: "json_schema", schema: formato.schema } },
      },
    }));

    try {
      const lote = await anthropic.messages.batches.create({ requests });
      const { error: errId } = await admin.from("lotes_consolidacion").update({ batch_id: lote.id }).eq("id", loteId);
      if (errId) console.error("consolidacion: el lote se creó pero no se pudo guardar su id", errId.code ?? "");
    } catch (e) {
      // No se creó el lote: se liberan las personas (quedan 'error' y vuelven a ser candidatas mañana).
      await cerrarLoteFallido(admin, loteId, codigoError(e));
      return { estado: "error", candidatos: ids.length, enviados: 0, vencidos };
    }
    return { estado: "enviado", candidatos: ids.length, enviados: filas.length, vencidos };
  } catch {
    console.warn("consolidacion: falló el envío");
    return { estado: "error", ...base };
  }
}

function codigoError(e: unknown): string {
  const err = e as { name?: unknown; status?: unknown } | null;
  if (err && typeof err.status === "number") return `anthropic_${err.status}`;
  if (err && err.name === "APIConnectionTimeoutError") return "timeout";
  return "interno";
}

/** Lote fallido: las personas que seguían 'enviado' pasan a 'error' (se reintentan la noche siguiente). */
async function cerrarLoteFallido(admin: Admin, loteId: string, codigo: string): Promise<void> {
  try {
    await admin.from("lote_usuarios").update({ estado: "error", error: codigo }).eq("lote_id", loteId).eq("estado", "enviado");
    await admin.from("lotes_consolidacion").update({ estado: "fallido", error: codigo, terminado_at: new Date().toISOString() }).eq("id", loteId);
  } catch {
    console.warn("consolidacion: no se pudo cerrar el lote fallido");
  }
}

// ---------------------------------------------------------------------------
// Poll y aplicación
// ---------------------------------------------------------------------------
export type ResumenProceso = {
  vencidos: number;
  lotes: number;
  terminados: number;
  aplicados: number;
  errores: number;
  unidos: number;
  destacados: number;
  contradicciones: number;
  estado?: "sin_migracion";
};

type FilaLote = { id: string; batch_id: string | null; estado: string; created_at: string; terminado_at: string | null };
type FilaLoteUsuario = { usuario_id: string; custom_id: string; snapshot: unknown };

export async function procesarLotesConsolidacion(
  admin: Admin = createAdminClient(),
  opciones: { presupuestoMs?: number } = {}
): Promise<ResumenProceso> {
  const limiteMs = performance.now() + (opciones.presupuestoMs ?? PRESUPUESTO_PROCESAR_MS);
  const resumen: ResumenProceso = { vencidos: await marcarVencidos(admin), lotes: 0, terminados: 0, aplicados: 0, errores: 0, unidos: 0, destacados: 0, contradicciones: 0 };
  if (!process.env.ANTHROPIC_API_KEY) return resumen;

  try {
    const { data, error } = await admin
      .from("lotes_consolidacion")
      .select("id, batch_id, estado, created_at, terminado_at")
      .in("estado", ["enviado", "terminado"])
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) {
      if (faltaMigracion(error)) resumen.estado = "sin_migracion";
      else console.warn("consolidacion: no se pudieron leer los lotes", error.code ?? "");
      return resumen;
    }

    for (const lote of (data ?? []) as FilaLote[]) {
      if (limiteMs - performance.now() < 5_000) break;
      resumen.lotes++;
      const edadMs = Date.now() - new Date(lote.created_at).getTime();

      if (!lote.batch_id) {
        if (edadMs > LOTE_HUERFANO_MS) await cerrarLoteFallido(admin, lote.id, "sin_lote_remoto");
        continue;
      }
      if (lote.estado === "enviado") {
        if (edadMs > LOTE_VENCE_MS) {
          await cerrarLoteFallido(admin, lote.id, "lote_vencido");
          continue;
        }
        let terminado = false;
        try {
          terminado = (await anthropic.messages.batches.retrieve(lote.batch_id)).processing_status === "ended";
        } catch (e) {
          console.warn("consolidacion: no se pudo consultar el lote", codigoError(e));
        }
        if (!terminado) continue;
      }

      // Reclamo: solo un poll lo gana. Un 'terminado' con reclamo vencido (el poll anterior murió o se quedó sin tiempo) se retoma.
      const vencido = new Date(Date.now() - RECLAMO_VENCE_MS).toISOString();
      const { data: reclamado, error: errReclamo } = await admin
        .from("lotes_consolidacion")
        .update({ estado: "terminado", terminado_at: new Date().toISOString() })
        .eq("id", lote.id)
        .or(`estado.eq.enviado,and(estado.eq.terminado,terminado_at.lt.${vencido})`)
        .select("id");
      if (errReclamo || !reclamado || reclamado.length === 0) continue;

      resumen.terminados++;
      await aplicarLote(admin, lote.id, lote.batch_id, limiteMs, resumen);
    }
  } catch {
    console.warn("consolidacion: falló el procesamiento");
  }
  return resumen;
}

type ResultadoLote = Awaited<ReturnType<Anthropic.Messages.Batches["results"]>> extends AsyncIterable<infer T> ? T : never;

async function marcarError(admin: Admin, loteId: string, usuarioId: string, codigo: string): Promise<boolean> {
  const { data, error } = await admin
    .from("lote_usuarios")
    .update({ estado: "error", error: codigo })
    .eq("lote_id", loteId)
    .eq("usuario_id", usuarioId)
    .eq("estado", "enviado")
    .select("usuario_id");
  return !error && (data?.length ?? 0) > 0;
}

/** Costo: tokens reales de la respuesta, con precio de lote (50%) en el cupo diario; la fila de registros_chat guarda los reales. */
async function contabilizarUso(usuarioId: string, tokensEntrada: number, tokensSalida: number, codigoError: string | null): Promise<void> {
  if (tokensEntrada > 0 || tokensSalida > 0) {
    await registrarUsoIA(usuarioId, { inputTokens: tokensFacturables(tokensEntrada), outputTokens: tokensFacturables(tokensSalida) });
  }
  await registrarRespuestaChat({
    usuario_id: usuarioId,
    pedido_id: null,
    sesion_id: null,
    version_prompt: VERSION_PROMPT_CONSOLIDACION,
    modelo: MODELO_RESUMEN,
    latencia_ms: 0, // trabajo por lote: la latencia no significa nada
    latencia_primer_token_ms: null,
    vueltas_modelo: 1,
    tools: ["consolidacion"],
    escrituras: 0,
    tokens_entrada: tokensEntrada,
    tokens_salida: tokensSalida,
    tokens_cache_lectura: 0,
    tokens_cache_escritura: 0,
    resultado: codigoError ? "error" : "ok",
    error_codigo: codigoError,
  });
}

async function aplicarLote(admin: Admin, loteId: string, batchId: string, limiteMs: number, resumen: ResumenProceso): Promise<void> {
  // Solo quienes siguen 'enviado': lo ya aplicado (un poll anterior que se quedó sin tiempo) no se toca.
  const { data: pendientes, error: errPend } = await admin.from("lote_usuarios").select("usuario_id, custom_id, snapshot").eq("lote_id", loteId).eq("estado", "enviado");
  if (errPend) return;
  const porCustomId = new Map(((pendientes ?? []) as FilaLoteUsuario[]).map((f) => [f.custom_id, f]));

  const resultados = new Map<string, ResultadoLote>();
  let completo = false;
  if (porCustomId.size > 0) {
    try {
      // Los resultados llegan en CUALQUIER orden: se indexan por custom_id.
      for await (const item of await anthropic.messages.batches.results(batchId)) {
        if (porCustomId.has(item.custom_id)) resultados.set(item.custom_id, item);
      }
      completo = true;
    } catch (e) {
      console.warn("consolidacion: no se pudieron leer los resultados", codigoError(e));
      return; // el reclamo vence y otro poll lo retoma
    }
  }

  const trabajo = [...porCustomId.values()];
  let siguiente = 0;
  async function trabajador(): Promise<void> {
    while (siguiente < trabajo.length && limiteMs - performance.now() > 4_000) {
      const fila = trabajo[siguiente++];
      try {
        await aplicarUsuario(admin, loteId, fila, resultados.get(fila.custom_id), completo, resumen);
      } catch {
        console.warn("consolidacion: falló la aplicación de una persona");
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA_APLICAR }, trabajador));

  // ¿Quedó alguien sin resolver? Si sí (sin tiempo), el lote sigue 'terminado' y se retoma cuando venza el reclamo.
  const { count } = await admin.from("lote_usuarios").select("usuario_id", { count: "exact", head: true }).eq("lote_id", loteId).eq("estado", "enviado");
  if (count === 0) {
    const { count: aplicadas } = await admin.from("lote_usuarios").select("usuario_id", { count: "exact", head: true }).eq("lote_id", loteId).eq("estado", "aplicado");
    await admin
      .from("lotes_consolidacion")
      .update({ estado: (aplicadas ?? 0) > 0 || porCustomId.size === 0 ? "aplicado" : "fallido", error: (aplicadas ?? 0) > 0 ? null : "sin_resultados" })
      .eq("id", loteId);
  }
}

async function aplicarUsuario(
  admin: Admin,
  loteId: string,
  fila: FilaLoteUsuario,
  item: ResultadoLote | undefined,
  streamCompleto: boolean,
  resumen: ResumenProceso
): Promise<void> {
  const usuarioId = fila.usuario_id;
  if (!item) {
    // El stream terminó y no trajo a esta persona: se reintenta mañana.
    if (streamCompleto && (await marcarError(admin, loteId, usuarioId, "sin_resultado"))) resumen.errores++;
    return;
  }
  if (item.result.type !== "succeeded") {
    // Errored / expired / canceled: se registra y la persona vuelve a ser candidata la noche siguiente. Sin uso: no hubo respuesta.
    if (await marcarError(admin, loteId, usuarioId, `lote_${item.result.type}`)) resumen.errores++;
    return;
  }

  const mensaje = item.result.message;
  const tokensEntrada = mensaje.usage.input_tokens;
  const tokensSalida = mensaje.usage.output_tokens;
  const fallar = async (codigo: string) => {
    // Se registra el uso solo si ESTE poll fue quien cerró a la persona (si no, otro ya lo contó).
    if (await marcarError(admin, loteId, usuarioId, codigo)) {
      resumen.errores++;
      await contabilizarUso(usuarioId, tokensEntrada, tokensSalida, codigo);
    }
  };

  if (mensaje.stop_reason === "max_tokens") return fallar("respuesta_truncada");
  if (mensaje.stop_reason === "refusal") return fallar("respuesta_rechazada");
  const texto = mensaje.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const crudo = extraerJson(texto);
  const snapshot = leerSnapshot(fila.snapshot);
  if (!crudo || !snapshot) return fallar("plan_invalido");

  // Los recuerdos tal como se mandaron (la posición en el snapshot es la referencia m<N> que vio el modelo). Solo se usan
  // para resolver referencias y chequear que dos recuerdos sean de la misma persona; el estado vigente lo vuelve a verificar la RPC.
  const enviados = await cargarEnviados(admin, usuarioId, snapshot);
  if (!enviados) return; // error de lectura: queda 'enviado' y se reintenta
  const plan = validarPlan(crudo, enviados);
  if (!plan) return fallar("plan_invalido");

  const { data, error } = await admin.rpc("aplicar_consolidacion", {
    p_lote: loteId,
    p_usuario: usuarioId,
    p_plan: plan,
    p_snapshot: snapshotComoMapa(snapshot),
    p_max_destacados: MAX_DESTACADOS,
    p_max_tokens_destacados: MAX_TOKENS_DESTACADOS,
  });
  if (error) {
    console.warn("consolidacion: no se pudo aplicar el plan", error.code ?? "");
    return; // sigue 'enviado': se reintenta en el próximo poll
  }
  const r = (Array.isArray(data) ? data[0] : data) as { o_estado?: string; o_unidos?: number; o_destacados?: number; o_contradicciones?: number } | undefined;
  if (r?.o_estado === "aplicado" || r?.o_estado === "memoria_apagada") {
    // Solo el poll que de verdad aplicó cuenta el uso: un segundo intento recibe 'ya_aplicado' y no suma nada.
    resumen.aplicados++;
    resumen.unidos += r.o_unidos ?? 0;
    resumen.destacados += r.o_destacados ?? 0;
    resumen.contradicciones += r.o_contradicciones ?? 0;
    await contabilizarUso(usuarioId, tokensEntrada, tokensSalida, null);
  }
}

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
