import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TOKENS_RESUMEN, MODELO_RESUMEN } from "@/lib/ai/modelo";
import { clasificarError } from "@/lib/chat/registros-logica";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import { faltaMigracion } from "./nucleo";
import {
  alcanzaParaOtraTarea,
  armarPromptResumen,
  contextoResumen,
  elegirCorte,
  MAX_FILAS_LECTURA,
  MAX_PERSONAS_POR_TICK,
  MINIMO_MENSAJES_PARA_RESUMIR,
  PRESUPUESTO_CRON_MS,
  SchemaResumen,
  SISTEMA_RESUMEN,
  timeoutDeLlamada,
  TIMEOUT_LLAMADA_MS,
  usoParaRegistro,
  validarSalidaResumen,
  type FilaResumible,
  type ResumenValidado,
} from "./resumen-logica";

// Resumen incremental de la conversación (memoria, fase 3, migración 041).
//
// Dos mitades:
//  - Cliente de SESIÓN (RLS owner-only): marcar "hay que resumir" (`pedirResumen`, desde el chat), leer el resumen
//    para el prompt, mostrarlo y borrarlo (pantalla de memoria).
//  - Cliente `service_role` (trabajador del cron `/api/cron/memoria`): procesa la cola de TODAS las personas. Es uso de
//    sistema sancionado (ver lib/supabase/admin.ts): cada tarea trabaja solo sobre el `usuario_id` de la fila de la cola
//    y las RPC de 041 que usa solo las ejecuta service_role. Nunca recibe ni devuelve texto de mensajes al llamador.
//
// Garantías:
//  - Nada se pierde ni se duplica: la fila es la cola (una marca por persona); la reserva de 2 min vence sola y a los 5
//    intentos se abandona hasta que lleguen mensajes nuevos.
//  - Nada viejo pisa a lo nuevo: `guardar_resumen` escribe solo si la versión sigue siendo la leída; "olvidar"/"borrar
//    historial"/borrar el resumen suben la versión (`invalidar_resumen`) y el resumen en vuelo se descarta.
//  - Los mensajes `excluido_memoria` nunca llegan al prompt (la RPC los devuelve vacíos y `elegirCorte` los descarta).
//  - El límite diario en dólares de la persona rige también acá: pasado el tope no se llama al modelo.

type Cliente = SupabaseClient;

// Sin reintentos del SDK: el reintento es la propia cola (vuelve a tomarse en un tick futuro), así el peor caso de una
// llamada es exactamente su timeout y cabe en el presupuesto del tick.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

// ---------------------------------------------------------------------------
// Lado de la sesión
// ---------------------------------------------------------------------------
/**
 * Marca el resumen de la persona como pendiente si se juntaron suficientes mensajes nuevos. Best-effort: nunca lanza ni
 * demora nada (se llama desde `after()`); sin la migración 041 no hace nada.
 */
export async function pedirResumen(supabase: Cliente): Promise<void> {
  try {
    const { error } = await supabase.rpc("marcar_resumen_pendiente", { p_minimo: MINIMO_MENSAJES_PARA_RESUMIR });
    if (error && !faltaMigracion(error)) console.warn("memoria: no se pudo marcar el resumen", error.code ?? "");
  } catch {
    console.warn("memoria: falló la marca del resumen");
  }
}

export type ResumenGuardado = { resumen: string; pendientes: string[]; actualizadoEl: string };

/** Resumen vigente de la persona (cliente de sesión). null si no hay, está vacío o falta la migración. Nunca lanza. */
export async function leerResumen(supabase: Cliente, usuarioId: string): Promise<ResumenGuardado | null> {
  try {
    const { data, error } = await supabase
      .from("resumen_conversacion")
      .select("resumen, pendientes, updated_at")
      .eq("usuario_id", usuarioId)
      .maybeSingle();
    if (error || !data) return null;
    const resumen = typeof data.resumen === "string" ? data.resumen : "";
    if (resumen.trim() === "") return null;
    const pendientes = Array.isArray(data.pendientes) ? (data.pendientes as unknown[]).filter((p): p is string => typeof p === "string") : [];
    return { resumen, pendientes, actualizadoEl: String(data.updated_at ?? "") };
  } catch {
    return null;
  }
}

/** Texto del resumen para el bloque dinámico del prompt (ya saneado y con tope). "" si no hay. */
export async function cargarContextoResumen(supabase: Cliente, usuarioId: string): Promise<string> {
  const r = await leerResumen(supabase, usuarioId);
  return r ? contextoResumen({ resumen: r.resumen, pendientes: r.pendientes }) : "";
}

/** Borra el resumen (queda vacío y la versión sube: uno en vuelo se descarta). Cliente de sesión. Devuelve si se pudo. */
export async function borrarResumen(supabase: Cliente): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("invalidar_resumen");
    // Sin la migración no hay resumen que borrar.
    return !error || faltaMigracion(error);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Trabajador
// ---------------------------------------------------------------------------
export type ResumenTick = { tomadas: number; hechas: number; falladas: number; omitidas: number };
type ResultadoTarea = { tipo: "hecha" | "omitida" } | { tipo: "fallo"; codigo: string };
type Tarea = { usuario_id: string; version: number; intentos: number };
type OpcionesTick = { presupuestoMs?: number; maxPersonas?: number };

/**
 * Procesa personas pendientes mientras quede tiempo para una llamada completa dentro del presupuesto. Reserva de a UNA
 * (no se reserva lo que no se va a poder trabajar). Nunca lanza.
 */
export async function procesarPendientes(admin: Cliente = createAdminClient(), opciones: OpcionesTick = {}): Promise<ResumenTick> {
  const maxPersonas = opciones.maxPersonas ?? MAX_PERSONAS_POR_TICK;
  const limiteMs = performance.now() + (opciones.presupuestoMs ?? PRESUPUESTO_CRON_MS);
  const tick: ResumenTick = { tomadas: 0, hechas: 0, falladas: 0, omitidas: 0 };

  while (tick.tomadas < maxPersonas) {
    if (!alcanzaParaOtraTarea(limiteMs - performance.now())) break;

    let tarea: Tarea | null = null;
    try {
      const { data, error } = await admin.rpc("tomar_resumenes_pendientes", { p_max: 1 });
      if (error) {
        if (!faltaMigracion(error)) console.warn("memoria: no se pudo tomar una tarea", error.code ?? "");
        break;
      }
      const fila = (Array.isArray(data) ? data[0] : data) as { o_usuario_id?: string; o_version?: number; o_intentos?: number } | null | undefined;
      if (!fila?.o_usuario_id) break;
      tarea = { usuario_id: fila.o_usuario_id, version: fila.o_version ?? 1, intentos: fila.o_intentos ?? 1 };
    } catch {
      break;
    }

    tick.tomadas++;
    let resultado: ResultadoTarea;
    try {
      resultado = await resumirPersona(admin, tarea, timeoutDeLlamada(limiteMs - performance.now()));
    } catch (e) {
      resultado = { tipo: "fallo", codigo: clasificarError(e) };
    }
    if (resultado.tipo === "hecha") tick.hechas++;
    else if (resultado.tipo === "omitida") tick.omitidas++;
    else tick.falladas++;

    try {
      const { error } = await admin.rpc("completar_resumen", {
        p_usuario: tarea.usuario_id,
        p_ok: resultado.tipo !== "fallo",
        p_error: resultado.tipo === "fallo" ? resultado.codigo : null,
      });
      if (error) console.warn("memoria: no se pudo completar la tarea", error.code ?? "");
    } catch {
      console.warn("memoria: no se pudo completar la tarea");
    }
  }
  return tick;
}

type SalidaModelo = { validado: ResumenValidado | null; codigoError: string | null };

/** Una llamada a Haiku (sin reintentos del SDK) + uso REAL registrado en el límite diario. Nunca lanza. */
async function llamarModelo(usuarioId: string, entrada: string, timeoutMs: number): Promise<SalidaModelo> {
  let usoRegistrado = false;
  try {
    // Salida estructurada por zod y, además, se vuelve a validar y sanear: no se confía en que el esquema alcance.
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
    // Lo que se gastó se cobra siempre, aunque la salida no sirva (incluye los tokens de cache que informe la API).
    await registrarUsoIA(usuarioId, usoParaRegistro(MODELO_RESUMEN, mensaje.usage));
    usoRegistrado = true;
    if (mensaje.stop_reason === "max_tokens") return { validado: null, codigoError: "resumen_truncado" };
    if (mensaje.stop_reason === "refusal") return { validado: null, codigoError: "resumen_rechazado" };
    const validado = validarSalidaResumen(mensaje.parsed_output);
    return validado ? { validado, codigoError: null } : { validado: null, codigoError: "resumen_invalido" };
  } catch (e) {
    return { validado: null, codigoError: usoRegistrado ? "resumen_invalido" : clasificarError(e) };
  }
}

async function resumirPersona(admin: Cliente, tarea: Tarea, timeoutMs: number): Promise<ResultadoTarea> {
  const usuarioId = tarea.usuario_id;

  // Memoria apagada: no se resume nada (los mensajes no se usan).
  const { data: perfil, error: errPerfil } = await admin.from("perfiles").select("memoria_activa").eq("id", usuarioId).maybeSingle();
  if (errPerfil) return { tipo: "fallo", codigo: "db" };
  if (!perfil || perfil.memoria_activa !== true) return { tipo: "omitida" };

  // El límite diario en dólares vale también para el trabajo de fondo: pasado el tope no se llama al modelo.
  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) return { tipo: "omitida" };

  const { data: actual, error: errResumen } = await admin
    .from("resumen_conversacion")
    .select("resumen, pendientes, version")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (errResumen || !actual) return { tipo: "fallo", codigo: "db" };
  // La versión cambió desde que se tomó (se olvidó algo o ya se guardó otro): se descarta, el chat vuelve a marcar.
  if (actual.version !== tarea.version) return { tipo: "omitida" };

  const { data: filas, error: errFilas } = await admin.rpc("mensajes_para_resumen", { p_usuario: usuarioId, p_limite: MAX_FILAS_LECTURA });
  if (errFilas) return { tipo: "fallo", codigo: faltaMigracion(errFilas) ? "sin_migracion" : "db" };
  const resumibles: FilaResumible[] = ((filas ?? []) as { o_id: string; o_role: string; o_contenido: string; o_created_at: string; o_excluido: boolean }[]).map((f) => ({
    id: f.o_id,
    role: f.o_role === "assistant" ? "assistant" : "user",
    contenido: f.o_contenido ?? "",
    created_at: f.o_created_at,
    excluido_memoria: f.o_excluido === true,
  }));

  const corte = elegirCorte(resumibles);
  if (!corte) return { tipo: "omitida" };

  let resumen = typeof actual.resumen === "string" ? actual.resumen : "";
  let pendientes = Array.isArray(actual.pendientes) ? (actual.pendientes as unknown[]).filter((p): p is string => typeof p === "string") : [];

  if (corte.mensajes.length > 0) {
    if (timeoutMs < 1_000) return { tipo: "fallo", codigo: "sin_tiempo" };
    const entrada = armarPromptResumen(
      { resumenAnterior: resumen, pendientesAnteriores: pendientes, mensajes: corte.mensajes },
      (iso) => fechaISOEnAR(new Date(iso))
    );
    const { validado, codigoError } = await llamarModelo(usuarioId, entrada, Math.min(timeoutMs, TIMEOUT_LLAMADA_MS));
    if (codigoError || !validado) return { tipo: "fallo", codigo: codigoError ?? "resumen_invalido" };
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
    p_version_esperada: tarea.version,
  });
  if (errGuardar) return { tipo: "fallo", codigo: faltaMigracion(errGuardar) ? "sin_migracion" : "db" };
  const fila = (Array.isArray(guardado) ? guardado[0] : guardado) as { o_guardado?: boolean } | undefined;
  // No se guardó: el resumen se invalidó o el historial cambió mientras se calculaba. Se descarta.
  return { tipo: fila?.o_guardado ? "hecha" : "omitida" };
}
