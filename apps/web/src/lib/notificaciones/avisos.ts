import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR } from "@/lib/medicamentos/nucleo";
import { enviarPush, type PayloadPush, type ResultadoPush } from "./push";
import {
  MINUTOS_POSPONER_SERVIDOR,
  PREFERENCIAS_POR_DEFECTO,
  recortarHora,
  type Aviso,
  type ClaveBooleana,
  type PreferenciasAvisos,
} from "./avisos-tipos";

// Núcleo de Avisos: centro de notificaciones (tabla `avisos`), preferencias,
// posposiciones y dedupe de los avisos programados. Mismo criterio que el
// resto de lib/notificaciones: funciones `(cliente, usuarioId, ...)`; las de
// lectura para pantallas degradan a vacío/defaults si la migración 020 todavía
// no está aplicada (nunca rompen Home/Perfil).
type Cliente = SupabaseClient;

// --- Centro de notificaciones (lecturas bajo RLS, cliente de sesión) ---------

export async function listarAvisos(supabase: Cliente, usuarioId: string, limite = 60): Promise<Aviso[]> {
  const consulta = (columnas: string) =>
    supabase.from("avisos").select(columnas).eq("usuario_id", usuarioId).order("created_at", { ascending: false }).limit(limite);
  const base = "id, usuario_id, tipo, titulo, cuerpo, url, datos, leido_at, created_at";
  const { data, error } = await consulta(`${base}, persona_id`);
  if (!error && data) return data as unknown as Aviso[];
  // Migración 028 sin aplicar: no existe persona_id, el feed propio sigue andando.
  const { data: legado, error: errorLegado } = await consulta(base);
  if (errorLegado || !legado) return [];
  return (legado as unknown as Omit<Aviso, "persona_id">[]).map((a) => ({ ...a, persona_id: null }));
}

export async function contarNoLeidos(supabase: Cliente, usuarioId: string): Promise<number> {
  const { count, error } = await supabase
    .from("avisos")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .is("leido_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function marcarLeido(supabase: Cliente, usuarioId: string, avisoId: string): Promise<boolean> {
  const { error } = await supabase
    .from("avisos")
    .update({ leido_at: new Date().toISOString() })
    .eq("id", avisoId)
    .eq("usuario_id", usuarioId)
    .is("leido_at", null);
  return !error;
}

export async function marcarTodosLeidos(supabase: Cliente, usuarioId: string): Promise<boolean> {
  const { error } = await supabase
    .from("avisos")
    .update({ leido_at: new Date().toISOString() })
    .eq("usuario_id", usuarioId)
    .is("leido_at", null);
  return !error;
}

// --- Preferencias ---------------------------------------------------------------

type FilaPreferencias = {
  silencio_desde: string | null;
  silencio_hasta: string | null;
  espera_cuidador_min: number;
  recordatorio_dosis: boolean;
  aviso_turnos: boolean;
  stock_bajo: boolean;
  // Migración 028: ausentes si todavía no está aplicada.
  pendiente_persona?: boolean;
  resumen_dia?: boolean;
  stock_persona?: boolean;
  turnos_persona?: boolean;
};

function desdeFila(f: FilaPreferencias): PreferenciasAvisos {
  return {
    silencio_desde: recortarHora(f.silencio_desde),
    silencio_hasta: recortarHora(f.silencio_hasta),
    espera_cuidador_min: f.espera_cuidador_min,
    recordatorio_dosis: f.recordatorio_dosis,
    aviso_turnos: f.aviso_turnos,
    stock_bajo: f.stock_bajo,
    pendiente_persona: f.pendiente_persona ?? PREFERENCIAS_POR_DEFECTO.pendiente_persona,
    resumen_dia: f.resumen_dia ?? PREFERENCIAS_POR_DEFECTO.resumen_dia,
    stock_persona: f.stock_persona ?? PREFERENCIAS_POR_DEFECTO.stock_persona,
    turnos_persona: f.turnos_persona ?? PREFERENCIAS_POR_DEFECTO.turnos_persona,
  };
}

const COLUMNAS_PREFS_BASE =
  "usuario_id, silencio_desde, silencio_hasta, espera_cuidador_min, recordatorio_dosis, aviso_turnos, stock_bajo";
const COLUMNAS_PREFS = `${COLUMNAS_PREFS_BASE}, pendiente_persona, resumen_dia, stock_persona, turnos_persona`;

/**
 * Preferencias + si las columnas de familia (migración 028) existen. Sin fila
 * (o con la tabla sin migrar) devuelve los defaults. Nunca lanza.
 */
export async function obtenerPreferenciasConEstado(
  supabase: Cliente,
  usuarioId: string
): Promise<{ prefs: PreferenciasAvisos; familiaDisponible: boolean }> {
  const completa = await supabase.from("preferencias_avisos").select(COLUMNAS_PREFS).eq("usuario_id", usuarioId).maybeSingle();
  if (!completa.error) {
    return {
      prefs: completa.data ? desdeFila(completa.data as unknown as FilaPreferencias) : { ...PREFERENCIAS_POR_DEFECTO },
      familiaDisponible: true,
    };
  }
  // Sin la 028: se reintenta con las columnas de la 020 para no perder el silencio ni los toggles.
  const legado = await supabase.from("preferencias_avisos").select(COLUMNAS_PREFS_BASE).eq("usuario_id", usuarioId).maybeSingle();
  if (legado.error || !legado.data) return { prefs: { ...PREFERENCIAS_POR_DEFECTO }, familiaDisponible: false };
  return { prefs: desdeFila(legado.data as unknown as FilaPreferencias), familiaDisponible: false };
}

export async function obtenerPreferencias(supabase: Cliente, usuarioId: string): Promise<PreferenciasAvisos> {
  return (await obtenerPreferenciasConEstado(supabase, usuarioId)).prefs;
}

/** Preferencias de varios usuarios (cron, service_role). Los que no tienen fila no aparecen. */
export async function obtenerPreferenciasDe(
  admin: Cliente,
  usuarioIds: string[]
): Promise<Map<string, PreferenciasAvisos>> {
  const mapa = new Map<string, PreferenciasAvisos>();
  if (usuarioIds.length === 0) return mapa;
  let filas: unknown[] | null = null;
  const completa = await admin.from("preferencias_avisos").select(COLUMNAS_PREFS).in("usuario_id", usuarioIds);
  if (!completa.error) filas = completa.data;
  else {
    // Sin la 028: columnas de la 020.
    const legado = await admin.from("preferencias_avisos").select(COLUMNAS_PREFS_BASE).in("usuario_id", usuarioIds);
    if (!legado.error) filas = legado.data;
  }
  if (!filas) return mapa;
  const data = filas;
  for (const f of data as unknown as (FilaPreferencias & { usuario_id: string })[]) mapa.set(f.usuario_id, desdeFila(f));
  return mapa;
}

/**
 * Cambia SOLO los campos del parche (toggles instantáneos de Configurar
 * avisos): el upsert no toca las demás columnas de una fila existente y, si no
 * hay fila, el resto toma los defaults de la tabla. Ya validado por quien llama.
 */
export async function actualizarPreferencias(
  supabase: Cliente,
  usuarioId: string,
  parche: Partial<Pick<PreferenciasAvisos, ClaveBooleana | "espera_cuidador_min" | "silencio_desde" | "silencio_hasta">>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("preferencias_avisos")
    .upsert({ usuario_id: usuarioId, ...parche, updated_at: new Date().toISOString() }, { onConflict: "usuario_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * La espera antes de avisar a quien cuida es de la PERSONA (la lee el cron
 * desde su fila). Un cuidador Admin la edita por la policy de la 021.
 */
export async function actualizarEsperaDePersona(
  supabase: Cliente,
  personaId: string,
  minutos: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  return actualizarPreferencias(supabase, personaId, { espera_cuidador_min: minutos });
}

/** Espera vigente de una persona (default 30). Nunca lanza. */
export async function esperaDePersona(supabase: Cliente, personaId: string): Promise<number> {
  const { data, error } = await supabase
    .from("preferencias_avisos")
    .select("espera_cuidador_min")
    .eq("usuario_id", personaId)
    .maybeSingle();
  if (error || !data) return PREFERENCIAS_POR_DEFECTO.espera_cuidador_min;
  return (data as { espera_cuidador_min: number }).espera_cuidador_min;
}

// --- Posposiciones ----------------------------------------------------------------

/**
 * "En 15 min" del lado del servidor: el cron vuelve a avisar cuando `hasta`
 * pasa y la dosis sigue sin tomarse. RLS exige que cada dosis sea del usuario.
 */
export async function posponerDosis(
  supabase: Cliente,
  usuarioId: string,
  medicamentoIds: string[],
  minutos: number = MINUTOS_POSPONER_SERVIDOR
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (medicamentoIds.length === 0) return { ok: true };
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + minutos * 60_000).toISOString();
  const fecha = fechaEnAR(ahora);
  const { error } = await supabase
    .from("posposiciones")
    .insert(medicamentoIds.map((id) => ({ medicamento_id: id, usuario_id: usuarioId, fecha, hasta })));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** "Verlas ahora": anula las posposiciones de hoy de esas dosis. */
export async function cancelarPosposiciones(
  supabase: Cliente,
  usuarioId: string,
  medicamentoIds: string[]
): Promise<boolean> {
  if (medicamentoIds.length === 0) return true;
  const { error } = await supabase
    .from("posposiciones")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("fecha", fechaEnAR())
    .in("medicamento_id", medicamentoIds);
  return !error;
}

// --- Entrega (código de sistema, cliente admin) -----------------------------------

/**
 * Dedupe claim-before-send: devuelve true solo si ESTE run ganó el derecho a
 * enviar (tipo, ref, fecha). Ante cualquier error devuelve false — mejor
 * saltear un aviso que duplicarlo.
 */
export async function reclamarEnvio(
  admin: Cliente,
  tipo: string,
  refId: string,
  fecha: string,
  usuarioId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("envios_avisos")
    .upsert({ tipo, ref_id: refId, fecha, usuario_id: usuarioId }, { onConflict: "tipo,ref_id,fecha", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function existeEnvio(admin: Cliente, tipo: string, refId: string, fecha: string): Promise<boolean> {
  const { data } = await admin
    .from("envios_avisos")
    .select("id")
    .eq("tipo", tipo)
    .eq("ref_id", refId)
    .eq("fecha", fecha)
    .maybeSingle();
  return Boolean(data);
}

export type DatosAviso = {
  tipo: string;
  titulo: string;
  cuerpo?: string;
  url?: string | null;
  datos?: Record<string, unknown>;
  /** Persona cuidada a la que se refiere (feed del cuidador). Migración 028. */
  personaId?: string | null;
};

/**
 * Inserta la fila del centro de notificaciones. Nunca lanza. Con `personaId`
 * intenta guardar la columna de la 028; si todavía no existe reintenta sin ella
 * (el aviso llega igual, solo sin el filtro por persona).
 */
export async function crearAviso(admin: Cliente, usuarioId: string, aviso: DatosAviso): Promise<boolean> {
  const fila = {
    usuario_id: usuarioId,
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo ?? "",
    url: aviso.url ?? null,
    datos: aviso.datos ?? {},
  };
  if (aviso.personaId) {
    const { error } = await admin.from("avisos").insert({ ...fila, persona_id: aviso.personaId });
    if (!error) return true;
  }
  const { error } = await admin.from("avisos").insert(fila);
  return !error;
}

/** ¿Está aplicada la migración 028? (los avisos de familia se apagan si no). Nunca lanza. */
export async function familiaAvisosDisponible(admin: Cliente): Promise<boolean> {
  const a = await admin.from("avisos").select("persona_id").limit(1);
  if (a.error) return false;
  const p = await admin.from("preferencias_avisos").select("resumen_dia").limit(1);
  return !p.error;
}

/**
 * Entrega un aviso: lo guarda en el centro de notificaciones del destinatario
 * y le manda el push. El feed se escribe SIEMPRE (aunque no tenga push
 * activado): es el canal que no depende del navegador.
 */
export async function entregarAviso(
  admin: Cliente,
  usuarioId: string,
  aviso: DatosAviso,
  payload: PayloadPush
): Promise<{ feed: boolean; push: ResultadoPush }> {
  const feed = await crearAviso(admin, usuarioId, aviso);
  const push = await enviarPush(admin, usuarioId, payload);
  return { feed, push };
}
