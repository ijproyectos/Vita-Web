import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TOKENS_RESUMEN, MODELO_RESUMEN } from "@/lib/ai/modelo";
import { claveDia } from "@/lib/chat/dias";
import { filtroAnteriorA, filtroPosteriorA, parsearCursor } from "@/lib/chat/cursor";
import { registrarRespuestaChat } from "@/lib/chat/registros";
import { clasificarError } from "@/lib/chat/registros-logica";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import {
  armarPromptResumen,
  elegirCorte,
  MAX_CHARS_MENSAJE,
  MAX_CHARS_NUEVOS,
  MAX_FILAS_LECTURA,
  SchemaResumen,
  SISTEMA_RESUMEN,
  validarSalidaResumen,
  type FilaResumible,
} from "./resumen-logica";

// Trabajador de la cola de memoria (M5). Corre con el cliente service_role porque la cola (`tareas_memoria`) no
// tiene policies y lo ejecuta un cron o el `after()` del chat, no una sesión: uso de sistema sancionado
// (ver lib/supabase/admin.ts). Cada tarea trabaja SOLO sobre el usuario_id que trae la fila de la cola, y las
// RPC de 037 solo las ejecuta service_role.
//
// Garantías de la cola:
//  - Nada se pierde: la tarea sigue 'pendiente' o 'en_curso' (reserva de 2 min) hasta que se completa; si el
//    trabajador muere, la reserva vence y otro la retoma (máx. 5 intentos, después 'fallida').
//  - Nada se duplica: un índice único deja UNA tarea pendiente por persona y tipo, y no se toma una tarea de
//    una persona que ya tiene otra en curso.
//  - Nada viejo pisa a lo nuevo: el resumen se escribe solo si su versión sigue siendo la que se leyó
//    (`guardar_resumen`); si otro ganó, este se descarta.
//  - La ventana del chat solo avanza cuando el resumen quedó guardado (es lo que mueve `cubre_hasta`).

type Admin = SupabaseClient;

export type TareaTomada = { id: string; usuario_id: string; tipo: string; version_esperada: number | null; intentos: number };
type Resultado = { ok: true; nota: string } | { ok: false; codigo: string };

// Sin reintentos del SDK: el reintento es la propia cola (la tarea vuelve a 'pendiente' y se toma en el próximo tick),
// así el peor caso de una llamada es exactamente su timeout y cabe en el presupuesto de quien la dispara.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
const VERSION_PROMPT_RESUMEN = "resumen-v1";

/** Error de "no existe la función/tabla": la migración 037 (o la 035) no se aplicó. */
function faltaMigracion(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42703", "42883", "PGRST205", "PGRST204", "PGRST202"].includes(error.code ?? "") || /does not exist|could not find the/i.test(error.message ?? "");
}

// ---------------------------------------------------------------------------
// Presupuestos de tiempo
// ---------------------------------------------------------------------------
/** Timeout de UNA llamada a Haiku según quién dispara. El trabajo pesado es del cron; el `after()` es oportunista. */
export const TIMEOUT_LLAMADA_CRON_MS = 25_000;
export const TIMEOUT_LLAMADA_CHAT_MS = 15_000;
/** Lo que queda para escribir en la base y cerrar después de la llamada. */
export const MARGEN_CIERRE_MS = 3_000;
/** Presupuesto total del cron: `maxDuration` 60 s menos ~10 s de margen. */
export const PRESUPUESTO_CRON_MS = 50_000;

// ---------------------------------------------------------------------------
// Encolar y disparar (lo llama el chat, best effort)
// ---------------------------------------------------------------------------
/**
 * Encola 'resumir' (o 'regenerar') para la persona (idempotente) y, si el presupuesto que le queda a quien llama
 * alcanza para una llamada completa, deja trabajando al trabajador sobre la tarea DE ESA PERSONA. Se usa desde
 * `after()`: nunca lanza, nunca demora la respuesta, y si algo falla o no alcanza el tiempo el cron de cada minuto
 * toma la cola igual.
 */
export async function pedirResumen(
  usuarioId: string,
  versionResumen: number,
  opciones: { tipo?: "resumir" | "regenerar"; presupuestoMs?: number } = {}
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("encolar_tarea_memoria", {
      p_usuario: usuarioId,
      p_tipo: opciones.tipo ?? "resumir",
      p_version_esperada: opciones.tipo === "regenerar" ? null : versionResumen,
    });
    if (error) {
      if (!faltaMigracion(error)) console.warn("memoria: no se pudo encolar el resumen", error.code ?? "");
      return;
    }
    const presupuestoMs = opciones.presupuestoMs ?? 0;
    if (presupuestoMs < TIMEOUT_LLAMADA_CHAT_MS + MARGEN_CIERRE_MS) return; // no alcanza: lo hace el cron
    await procesarCola(admin, { maxTareas: 1, presupuestoMs, timeoutLlamadaMs: TIMEOUT_LLAMADA_CHAT_MS, usuarioId });
  } catch {
    console.warn("memoria: falló el disparo del resumen");
  }
}

// ---------------------------------------------------------------------------
// Cola
// ---------------------------------------------------------------------------
export type ResumenCola = { procesadas: number; hechas: number; falladas: number };
type OpcionesCola = {
  maxTareas?: number;
  /** Tiempo total del que dispone quien llama, desde ahora. */
  presupuestoMs?: number;
  /** Timeout de UNA llamada al modelo. Antes de tomar cada tarea tiene que quedar este tiempo + el margen de cierre. */
  timeoutLlamadaMs?: number;
  /** Solo tareas de esta persona (el `after()` del chat). Sin esto, cualquiera (el cron). */
  usuarioId?: string;
};

/** Toma y procesa tareas hasta `maxTareas` o hasta que no quede tiempo para otra llamada completa. Nunca lanza. */
export async function procesarCola(admin: Admin = createAdminClient(), opciones: OpcionesCola = {}): Promise<ResumenCola> {
  const maxTareas = opciones.maxTareas ?? 3;
  const timeoutLlamadaMs = opciones.timeoutLlamadaMs ?? TIMEOUT_LLAMADA_CRON_MS;
  const limiteMs = performance.now() + (opciones.presupuestoMs ?? PRESUPUESTO_CRON_MS);
  const resumen: ResumenCola = { procesadas: 0, hechas: 0, falladas: 0 };

  while (resumen.procesadas < maxTareas) {
    // No se toma una tarea (esto cuenta un intento y la reserva) si no queda tiempo para una llamada completa.
    const restanteMs = limiteMs - performance.now();
    if (restanteMs < timeoutLlamadaMs + MARGEN_CIERRE_MS) break;

    let tarea: TareaTomada | null = null;
    try {
      const { data, error } = await admin.rpc("tomar_tarea_memoria", { p_usuario: opciones.usuarioId ?? null });
      if (error) {
        if (!faltaMigracion(error)) console.warn("memoria: no se pudo tomar una tarea", error.code ?? "");
        break;
      }
      const fila = (Array.isArray(data) ? data[0] : data) as
        | { o_id?: string; o_usuario_id?: string; o_tipo?: string; o_version_esperada?: number | null; o_intentos?: number }
        | null
        | undefined;
      if (!fila?.o_id || !fila.o_usuario_id) break;
      tarea = { id: fila.o_id, usuario_id: fila.o_usuario_id, tipo: fila.o_tipo ?? "", version_esperada: fila.o_version_esperada ?? null, intentos: fila.o_intentos ?? 1 };
    } catch {
      break;
    }

    resumen.procesadas++;
    // El timeout de la llamada nunca pasa de lo que queda menos el margen de cierre.
    const timeoutMs = Math.min(timeoutLlamadaMs, limiteMs - performance.now() - MARGEN_CIERRE_MS);
    let resultado: Resultado;
    try {
      resultado = await ejecutarTarea(admin, tarea, timeoutMs);
    } catch (e) {
      resultado = { ok: false, codigo: clasificarError(e) };
    }
    if (resultado.ok) resumen.hechas++;
    else resumen.falladas++;

    try {
      // Si la reserva venció y otro retomó la tarea, esto no la pisa (la RPC solo actúa sobre 'en_curso').
      const { data: encontrada, error: errCompletar } = await admin.rpc("completar_tarea_memoria", {
        p_id: tarea.id,
        p_ok: resultado.ok,
        p_error: resultado.ok ? null : resultado.codigo,
      });
      if (errCompletar) console.warn("memoria: no se pudo completar la tarea", errCompletar.code ?? "");
      else if (encontrada === false) console.warn("memoria: la tarea ya no estaba en curso (la retomó otro trabajador)");
    } catch {
      console.warn("memoria: no se pudo completar la tarea");
    }
  }
  return resumen;
}

async function ejecutarTarea(admin: Admin, tarea: TareaTomada, timeoutMs: number): Promise<Resultado> {
  if (tarea.tipo === "resumir") return resumirConversacion(admin, tarea, timeoutMs);
  if (tarea.tipo === "regenerar") return regenerarResumen(admin, tarea, timeoutMs);
  return { ok: false, codigo: "tipo_no_soportado" };
}

// ---------------------------------------------------------------------------
// Resumen incremental
// ---------------------------------------------------------------------------
type FilaResumen = { invalidado?: boolean; resumen: string; pendientes: unknown; cubre_hasta_mensaje_id: string | null; cubre_hasta_created_at: string | null; version: number };

type SalidaHaiku = { validado: ReturnType<typeof validarSalidaResumen>; codigoError: string | null };

/** Una llamada a Haiku (sin reintentos del SDK) + uso diario + fila de registros_chat. Nunca lanza. */
async function llamarHaiku(usuarioId: string, entrada: string, timeoutMs: number): Promise<SalidaHaiku> {
  const inicio = performance.now();
  let tokensEntrada = 0;
  let tokensSalida = 0;
  let codigoError: string | null = null;
  let validado: ReturnType<typeof validarSalidaResumen> = null;
  try {
    // Haiku 5.5: razonamiento adaptativo prendido por defecto (effort "low" para que no se coma el margen); sin
    // temperature/top_p (no se admiten valores distintos del default). La salida va por salida estructurada y
    // se vuelve a validar con zod: no se confía en que el esquema alcance.
    const mensaje = await anthropic.messages.parse(
      {
        model: MODELO_RESUMEN,
        max_tokens: MAX_TOKENS_RESUMEN,
        system: SISTEMA_RESUMEN,
        messages: [{ role: "user", content: entrada }],
        output_config: { effort: "low", format: zodOutputFormat(SchemaResumen) },
      },
      { timeout: timeoutMs, maxRetries: 0 }
    );
    tokensEntrada = mensaje.usage.input_tokens;
    tokensSalida = mensaje.usage.output_tokens;
    if (mensaje.stop_reason === "max_tokens") codigoError = "resumen_truncado";
    else if (mensaje.stop_reason === "refusal") codigoError = "resumen_rechazado";
    else {
      validado = validarSalidaResumen(mensaje.parsed_output);
      if (!validado) codigoError = "resumen_invalido";
    }
  } catch (e) {
    codigoError = clasificarError(e);
  }

  // Costo: los tokens REALES de la llamada cuentan en el uso diario de la persona (es trabajo de fondo, pero lo
  // paga su cupo) y queda una fila en registros_chat (solo métricas: sin texto, tools = ['resumen']).
  if (tokensEntrada > 0 || tokensSalida > 0) await registrarUsoIA(usuarioId, { inputTokens: tokensEntrada, outputTokens: tokensSalida });
  await registrarRespuestaChat({
    usuario_id: usuarioId,
    pedido_id: null,
    sesion_id: null,
    version_prompt: VERSION_PROMPT_RESUMEN,
    modelo: MODELO_RESUMEN,
    latencia_ms: Math.max(0, Math.round(performance.now() - inicio)),
    latencia_primer_token_ms: null,
    vueltas_modelo: 1,
    tools: ["resumen"],
    escrituras: 0,
    tokens_entrada: tokensEntrada,
    tokens_salida: tokensSalida,
    tokens_cache_lectura: 0,
    tokens_cache_escritura: 0,
    resultado: codigoError ? "error" : "ok",
    error_codigo: codigoError,
  });
  return { validado, codigoError };
}

// ---------------------------------------------------------------------------
// Regenerar (tras dejar de recordar / eliminar / Borrar historial)
// ---------------------------------------------------------------------------
/**
 * Rearma el resumen DESDE CERO con los mensajes no excluidos hasta el corte actual (`cubre_hasta`), que no cambia.
 * Mientras el resumen está invalidado el chat no manda ninguno a Claude. Lee como mucho las últimas MAX_FILAS_LECTURA
 * filas anteriores al corte y se queda con las más nuevas que entren en MAX_CHARS_NUEVOS (una sola llamada): lo más
 * viejo sigue alcanzable por buscar_memoria. Se guarda solo si la versión no cambió y sigue invalidado.
 */
async function regenerarResumen(admin: Admin, tarea: TareaTomada, timeoutMs: number): Promise<Resultado> {
  const usuarioId = tarea.usuario_id;
  const { data: perfil, error: errPerfil } = await admin.from("perfiles").select("memoria_activa").eq("id", usuarioId).maybeSingle();
  if (errPerfil) return { ok: false, codigo: "db" };
  // Apagada: queda invalidado; al prenderla, el chat vuelve a pedir la regeneración.
  if (!perfil || perfil.memoria_activa !== true) return { ok: true, nota: "memoria_apagada" };
  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) return { ok: true, nota: "limite_diario" };

  const { data: actual, error: errResumen } = await admin.from("resumen_conversacion").select("*").eq("usuario_id", usuarioId).maybeSingle();
  if (errResumen) return { ok: false, codigo: "db" };
  const previo = actual as (FilaResumen & { invalidado?: boolean }) | null;
  if (!previo || previo.invalidado !== true) return { ok: true, nota: "nada_que_regenerar" };

  const cursor = previo.cubre_hasta_mensaje_id && previo.cubre_hasta_created_at
    ? parsearCursor({ created_at: previo.cubre_hasta_created_at, id: previo.cubre_hasta_mensaje_id })
    : null;
  let mensajes: FilaResumible[] = [];
  if (cursor) {
    // Hasta el corte inclusive, sin lo excluido; las más nuevas primero y después se da vuelta.
    const { data: filas, error: errFilas } = await admin
      .from("mensajes_chat")
      .select("id, role, contenido, created_at, excluido_memoria")
      .eq("usuario_id", usuarioId)
      .eq("excluido_memoria", false)
      .or(`${filtroAnteriorA(cursor)},id.eq.${cursor.id}`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_FILAS_LECTURA);
    if (errFilas) return { ok: false, codigo: "db" };
    let chars = 0;
    for (const f of (filas ?? []) as FilaResumible[]) {
      if (f.contenido.trim() === "") continue;
      chars += Math.min(f.contenido.length, MAX_CHARS_MENSAJE);
      if (chars > MAX_CHARS_NUEVOS) break;
      mensajes.push(f);
    }
    mensajes = mensajes.reverse();
    // El resumen arranca en un mensaje de la persona.
    while (mensajes.length > 0 && mensajes[0].role !== "user") mensajes.shift();
  }

  let resumen = "";
  let pendientes: string[] = [];
  if (mensajes.length > 0) {
    const entrada = armarPromptResumen(
      { resumenAnterior: "", pendientesAnteriores: [], mensajes },
      (iso) => claveDia(iso) || iso.slice(0, 10)
    );
    const { validado, codigoError } = await llamarHaiku(usuarioId, entrada, timeoutMs);
    if (codigoError || !validado) return { ok: false, codigo: codigoError ?? "resumen_invalido" };
    resumen = validado.resumen;
    pendientes = validado.pendientes;
  }
  // Sin mensajes que resumir (se borraron o se excluyeron todos) el resumen queda vacío y vigente.

  const { data: guardado, error: errGuardar } = await admin.rpc("guardar_resumen_regenerado", {
    p_usuario: usuarioId,
    p_resumen: resumen,
    p_pendientes: pendientes,
    p_version_esperada: previo.version,
  });
  if (errGuardar) return { ok: false, codigo: faltaMigracion(errGuardar) ? "sin_migracion" : "db" };
  const fila = (Array.isArray(guardado) ? guardado[0] : guardado) as { o_guardado?: boolean } | undefined;
  // No se guardó: la persona volvió a olvidar algo mientras se calculaba (cambió la versión). Esa acción encoló otra tarea.
  return { ok: true, nota: fila?.o_guardado ? "guardado" : "descartado_version" };
}

/** Encola 'regenerar' (siempre; ver 038) y, si el presupuesto alcanza, deja trabajando al trabajador sobre esa persona. */
export async function pedirRegeneracion(usuarioId: string, presupuestoMs = 0): Promise<void> {
  await pedirResumen(usuarioId, 0, { tipo: "regenerar", presupuestoMs });
}

async function resumirConversacion(admin: Admin, tarea: TareaTomada, timeoutMs: number): Promise<Resultado> {
  const usuarioId = tarea.usuario_id;

  // Memoria apagada: no se resume nada (los mensajes no se usan). Sin la columna (035) tampoco hay nada que hacer.
  const { data: perfil, error: errPerfil } = await admin.from("perfiles").select("memoria_activa").eq("id", usuarioId).maybeSingle();
  if (errPerfil) return { ok: false, codigo: "db" };
  if (!perfil || perfil.memoria_activa !== true) return { ok: true, nota: "memoria_apagada" };

  // El límite diario de tokens vale también para el trabajo de fondo: pasado el tope no se gasta más.
  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) return { ok: true, nota: "limite_diario" };

  const { data: actual, error: errResumen } = await admin.from("resumen_conversacion").select("*").eq("usuario_id", usuarioId).maybeSingle();
  if (errResumen) return { ok: false, codigo: "db" };
  const previo = actual as FilaResumen | null;
  const version = previo?.version ?? 0;
  // Resumen invalidado (se olvidó algo): lo rearma 'regenerar', no una continuación de lo viejo.
  if (previo?.invalidado === true) return { ok: true, nota: "invalidado" };
  // La tarea se encoló mirando otra versión: otro resumen ya se guardó desde entonces. Se descarta; el chat vuelve a
  // pedir uno si la ventana sigue grande.
  if (tarea.version_esperada !== null && tarea.version_esperada !== version) return { ok: true, nota: "version_vieja" };

  // Mensajes posteriores a lo ya cubierto, los más viejos primero.
  const cursor = previo?.cubre_hasta_mensaje_id && previo.cubre_hasta_created_at
    ? parsearCursor({ created_at: previo.cubre_hasta_created_at, id: previo.cubre_hasta_mensaje_id })
    : null;
  let consulta = admin.from("mensajes_chat").select("id, role, contenido, created_at, excluido_memoria").eq("usuario_id", usuarioId);
  if (cursor) consulta = consulta.or(filtroPosteriorA(cursor));
  const { data: filas, error: errFilas } = await consulta.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(MAX_FILAS_LECTURA);
  if (errFilas) return { ok: false, codigo: "db" };

  const corte = elegirCorte((filas ?? []) as FilaResumible[]);
  if (!corte) return { ok: true, nota: "nada_para_resumir" };

  let resumen = previo?.resumen ?? "";
  let pendientes = Array.isArray(previo?.pendientes) ? (previo.pendientes as unknown[]).filter((p): p is string => typeof p === "string") : [];

  if (corte.mensajes.length > 0) {
    const entrada = armarPromptResumen(
      { resumenAnterior: resumen, pendientesAnteriores: pendientes, mensajes: corte.mensajes },
      (iso) => claveDia(iso) || iso.slice(0, 10)
    );
    const { validado, codigoError } = await llamarHaiku(usuarioId, entrada, timeoutMs);
    if (codigoError || !validado) return { ok: false, codigo: codigoError ?? "resumen_invalido" };
    resumen = validado.resumen;
    pendientes = validado.pendientes;
  }
  // Si todo lo cubierto era de mensajes excluidos no hay llamada: el resumen queda igual y solo avanza el cursor.

  const { data: guardado, error: errGuardar } = await admin.rpc("guardar_resumen", {
    p_usuario: usuarioId,
    p_resumen: resumen,
    p_pendientes: pendientes,
    p_cubre_hasta_id: corte.cubreHasta.id,
    p_cubre_hasta_created_at: corte.cubreHasta.created_at,
    p_version_esperada: version,
  });
  if (errGuardar) return { ok: false, codigo: faltaMigracion(errGuardar) ? "sin_migracion" : "db" };
  const fila = (Array.isArray(guardado) ? guardado[0] : guardado) as { o_guardado?: boolean } | undefined;
  // No se guardó: otro resumen ganó o el historial cambió mientras se resumía. Se descarta el de esta tarea.
  return { ok: true, nota: fila?.o_guardado ? "guardado" : "descartado_version" };
}
