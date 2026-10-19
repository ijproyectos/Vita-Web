import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR } from "@/lib/medicamentos/nucleo";
import { enviarPush, type PayloadPush, type ResultadoPush } from "./push";
import {
  MINUTOS_POSPONER_SERVIDOR,
  PREFERENCIAS_POR_DEFECTO,
  esHoraValida,
  recortarHora,
  type Aviso,
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
  const { data, error } = await supabase
    .from("avisos")
    .select("id, usuario_id, tipo, titulo, cuerpo, url, datos, leido_at, created_at")
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  return data as Aviso[];
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
};

function desdeFila(f: FilaPreferencias): PreferenciasAvisos {
  return {
    silencio_desde: recortarHora(f.silencio_desde),
    silencio_hasta: recortarHora(f.silencio_hasta),
    espera_cuidador_min: f.espera_cuidador_min,
    recordatorio_dosis: f.recordatorio_dosis,
    aviso_turnos: f.aviso_turnos,
    stock_bajo: f.stock_bajo,
  };
}

const COLUMNAS_PREFS =
  "usuario_id, silencio_desde, silencio_hasta, espera_cuidador_min, recordatorio_dosis, aviso_turnos, stock_bajo";

/** Sin fila (o con la tabla sin migrar) devuelve los defaults. Nunca lanza. */
export async function obtenerPreferencias(supabase: Cliente, usuarioId: string): Promise<PreferenciasAvisos> {
  const { data, error } = await supabase
    .from("preferencias_avisos")
    .select(COLUMNAS_PREFS)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (error || !data) return { ...PREFERENCIAS_POR_DEFECTO };
  return desdeFila(data as FilaPreferencias);
}

/** Preferencias de varios usuarios (cron, service_role). Los que no tienen fila no aparecen. */
export async function obtenerPreferenciasDe(
  admin: Cliente,
  usuarioIds: string[]
): Promise<Map<string, PreferenciasAvisos>> {
  const mapa = new Map<string, PreferenciasAvisos>();
  if (usuarioIds.length === 0) return mapa;
  const { data, error } = await admin
    .from("preferencias_avisos")
    .select(COLUMNAS_PREFS)
    .in("usuario_id", usuarioIds);
  if (error || !data) return mapa;
  for (const f of data as (FilaPreferencias & { usuario_id: string })[]) mapa.set(f.usuario_id, desdeFila(f));
  return mapa;
}

export async function guardarPreferencias(
  supabase: Cliente,
  usuarioId: string,
  prefs: PreferenciasAvisos
): Promise<{ ok: true } | { ok: false; error: string }> {
  const conSilencio = Boolean(prefs.silencio_desde && prefs.silencio_hasta);
  if (conSilencio && (!esHoraValida(prefs.silencio_desde) || !esHoraValida(prefs.silencio_hasta))) {
    return { ok: false, error: "El horario de silencio no es válido." };
  }
  const { error } = await supabase.from("preferencias_avisos").upsert(
    {
      usuario_id: usuarioId,
      silencio_desde: conSilencio ? prefs.silencio_desde : null,
      silencio_hasta: conSilencio ? prefs.silencio_hasta : null,
      espera_cuidador_min: prefs.espera_cuidador_min,
      recordatorio_dosis: prefs.recordatorio_dosis,
      aviso_turnos: prefs.aviso_turnos,
      stock_bajo: prefs.stock_bajo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
};

/** Inserta la fila del centro de notificaciones. Nunca lanza. */
export async function crearAviso(admin: Cliente, usuarioId: string, aviso: DatosAviso): Promise<boolean> {
  const { error } = await admin.from("avisos").insert({
    usuario_id: usuarioId,
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo ?? "",
    url: aviso.url ?? null,
    datos: aviso.datos ?? {},
  });
  return !error;
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
