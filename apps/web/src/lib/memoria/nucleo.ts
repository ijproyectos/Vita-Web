import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { limpiarDato } from "@/lib/ai/limpiar";
import { claveDia } from "@/lib/chat/dias";
import {
  claveSobre,
  claveSobreResuelto,
  escaparLike,
  normalizarClave,
  normalizarTexto,
  normalizarTipo,
  resolverSobre,
  vencimientoPasajero,
  type SobreResuelto,
} from "./claves";
import type { MemoriaContexto } from "./contexto";
import type { Memoria, ResumenConversacion, TipoMemoria } from "./tipos";

// Acceso a datos de la memoria. Todo con el cliente de SESIÓN (RLS owner-only de 035): nunca service_role.
// Cada función degrada si la migración 035 (o la 036) no está aplicada: nada de esto puede tumbar el chat.
type Cliente = SupabaseClient;
type MiembroMinimo = { id: string; nombre: string };

/** Error de "no existe la tabla/columna/función": la migración correspondiente no se aplicó. */
export function faltaMigracion(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const { code, message } = error;
  if (code === "42P01" || code === "42703" || code === "42883" || code === "PGRST205" || code === "PGRST204" || code === "PGRST202") return true;
  return /does not exist|could not find the (table|function|.* column)/i.test(message ?? "");
}

// ---------------------------------------------------------------------------
// Estado de la memoria de la persona
// ---------------------------------------------------------------------------
export type EstadoMemoria = { activa: boolean; avisoVisto: boolean };

/**
 * `perfiles.memoria_activa`. Sin la migración 035 (columna inexistente) o ante cualquier error la memoria
 * se considera APAGADA: el chat se comporta como antes (sin herramientas ni capas 2–3).
 */
export async function estadoMemoria(supabase: Cliente, usuarioId: string): Promise<EstadoMemoria> {
  try {
    const { data, error } = await supabase
      .from("perfiles")
      .select("memoria_activa, memoria_aviso_visto_at")
      .eq("id", usuarioId)
      .maybeSingle();
    if (error || !data) return { activa: false, avisoVisto: true };
    return { activa: data.memoria_activa === true, avisoVisto: data.memoria_aviso_visto_at != null };
  } catch {
    return { activa: false, avisoVisto: true };
  }
}

// ---------------------------------------------------------------------------
// Lectura para las capas 2 y 3
// ---------------------------------------------------------------------------
/** Recuerdos vigentes candidatos al contexto (la selección y el tope en tokens los hace construirBloqueMemorias). */
export async function cargarMemoriasParaContexto(supabase: Cliente, usuarioId: string): Promise<MemoriaContexto[]> {
  try {
    const { data, error } = await supabase
      .from("memorias")
      .select("id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, destacado, usos, vence_at, estado, updated_at")
      .eq("usuario_id", usuarioId)
      .eq("estado", "vigente")
      .order("destacado", { ascending: false })
      .order("usos", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(120);
    if (error) return [];
    return (data ?? []) as MemoriaContexto[];
  } catch {
    return [];
  }
}

/** Resumen confirmado de la conversación (lo produce M5). null si no hay o la tabla no existe. */
export async function cargarResumen(supabase: Cliente, usuarioId: string): Promise<ResumenConversacion | null> {
  try {
    const { data, error } = await supabase.from("resumen_conversacion").select("*").eq("usuario_id", usuarioId).maybeSingle();
    if (error || !data) return null;
    return data as ResumenConversacion;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// recordar
// ---------------------------------------------------------------------------
export type FilaMemoriaVigente = Pick<Memoria, "id" | "sobre_tipo" | "sobre_perfil_id" | "sobre_nombre" | "texto" | "tipo" | "vence_at">;

export type ResultadoRecordar =
  | { ok: true; id: string; texto: string; sobre: SobreResuelto; tipo: TipoMemoria; corrige: { id: string; texto: string | null } | null; primera: boolean }
  | { ok: true; igual: true }
  | { ok: false; motivo: "apagada" | "no_disponible" | "sobre" | "clave" | "texto_vacio" | "texto_largo" | "error" };

/**
 * Guarda (o corrige) un recuerdo del usuario. Misma (dueño, sobre, clave) vigente = corrección: el nuevo apunta
 * al anterior y el anterior pasa a 'reemplazado'. Lo hace la RPC `guardar_memoria` (036) en una transacción;
 * sin ella, en dos tiempos con el índice único de 035 como guarda y compensación si falla el segundo paso.
 */
export async function recordarMemoria(
  supabase: Cliente,
  usuarioId: string,
  familia: MiembroMinimo[],
  input: { sobre: unknown; clave: unknown; texto: unknown; tipo: unknown },
  mensajeOrigenId: string | null = null
): Promise<ResultadoRecordar> {
  const estado = await estadoMemoria(supabase, usuarioId);
  if (!estado.activa) return { ok: false, motivo: "apagada" };

  const sobre = resolverSobre(input.sobre, usuarioId, familia);
  if (!sobre) return { ok: false, motivo: "sobre" };
  const clave = normalizarClave(input.clave);
  if (!clave) return { ok: false, motivo: "clave" };
  const texto = normalizarTexto(input.texto);
  if (!texto.ok) return { ok: false, motivo: texto.motivo === "largo" ? "texto_largo" : "texto_vacio" };
  const tipo = normalizarTipo(input.tipo);
  const venceAt = tipo === "pasajero" ? vencimientoPasajero() : null;

  // Buscar antes de guardar: si el vigente ya dice lo mismo (y es del mismo tipo), no se duplica.
  const claveDeSobre = claveSobreResuelto(sobre);
  const { data: previos, error: errPrevios } = await supabase
    .from("memorias")
    .select("id, sobre_tipo, sobre_perfil_id, sobre_nombre, texto, tipo, vence_at")
    .eq("usuario_id", usuarioId)
    .eq("estado", "vigente")
    .eq("clave", clave);
  if (errPrevios) return { ok: false, motivo: faltaMigracion(errPrevios) ? "no_disponible" : "error" };
  const previo = ((previos ?? []) as FilaMemoriaVigente[]).find((p) => claveSobre(p) === claveDeSobre);
  // Un pasajero vencido (vence_at <= ahora) sigue 'vigente' en la tabla pero ya no cuenta: no es "lo mismo", se
  // guarda uno nuevo (que además lo reemplaza, y así el índice de un solo vigente no frena el alta).
  const previoVencido = !!previo && previo.tipo === "pasajero" && (!previo.vence_at || new Date(previo.vence_at).getTime() <= Date.now());
  if (previo && !previoVencido && previo.texto === texto.texto && previo.tipo === tipo) return { ok: true, igual: true };

  const guardado = await guardarAtomico(supabase, usuarioId, sobre, clave, texto.texto, tipo, venceAt, previo, mensajeOrigenId);
  if (!guardado) return { ok: false, motivo: "error" };

  // Primera vez: el servidor marca el aviso como visto. El update condicional es el "reclamo": solo quien
  // lo hace pasar de null a fecha ve el texto de bienvenida (dos recuerdos a la vez no lo repiten).
  let primera = false;
  if (!estado.avisoVisto) {
    try {
      const { data } = await supabase
        .from("perfiles")
        .update({ memoria_aviso_visto_at: new Date().toISOString() })
        .eq("id", usuarioId)
        .is("memoria_aviso_visto_at", null)
        .select("id");
      primera = (data?.length ?? 0) > 0;
    } catch {
      // Best-effort: sin la marca, el aviso se repite en el próximo recuerdo.
    }
  }

  return {
    ok: true,
    id: guardado.id,
    texto: texto.texto,
    sobre,
    tipo,
    corrige: guardado.corrigeId ? { id: guardado.corrigeId, texto: guardado.textoAnterior } : null,
    primera,
  };
}

export async function guardarAtomico(
  supabase: Cliente,
  usuarioId: string,
  sobre: SobreResuelto,
  clave: string,
  texto: string,
  tipo: TipoMemoria,
  venceAt: string | null,
  previo: FilaMemoriaVigente | undefined,
  mensajeOrigenId: string | null,
  origen: "chat" | "usuario" = "chat"
): Promise<{ id: string; corrigeId: string | null; textoAnterior: string | null } | null> {
  const rpc = await supabase.rpc("guardar_memoria", {
    p_sobre_tipo: sobre.tipo,
    p_sobre_perfil_id: sobre.perfilId,
    p_sobre_nombre: sobre.nombre,
    p_clave: clave,
    p_texto: texto,
    p_tipo: tipo,
    p_vence_at: venceAt,
    p_mensaje_origen_id: mensajeOrigenId,
    p_origen: origen,
  });
  if (!rpc.error) {
    const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_id?: string; o_corrige_id?: string | null; o_texto_anterior?: string | null } | undefined;
    if (!fila?.o_id) return null;
    return { id: fila.o_id, corrigeId: fila.o_corrige_id ?? null, textoAnterior: fila.o_texto_anterior ?? null };
  }
  if (!faltaMigracion(rpc.error)) {
    console.warn("guardar_memoria: falló la RPC", rpc.error.code ?? "");
    return null;
  }

  // Sin 036: dos pasos. 1) el vigente pasa a 'reemplazado' (condicional: solo si sigue vigente); 2) se inserta el
  // nuevo. Si el insert falla, el paso 1 se revierte. Entre medio el índice único impide dos vigentes.
  let reemplazadoId: string | null = null;
  if (previo) {
    const { data, error } = await supabase
      .from("memorias")
      .update({ estado: "reemplazado", updated_at: new Date().toISOString() })
      .eq("id", previo.id)
      .eq("usuario_id", usuarioId)
      .eq("estado", "vigente")
      .select("id");
    if (error || !data || data.length === 0) return null;
    reemplazadoId = previo.id;
  }
  const { data: nuevo, error: errInsert } = await supabase
    .from("memorias")
    .insert({
      usuario_id: usuarioId,
      sobre_tipo: sobre.tipo,
      sobre_perfil_id: sobre.perfilId,
      sobre_nombre: sobre.nombre,
      clave,
      texto,
      tipo,
      vence_at: venceAt,
      corrige_id: reemplazadoId,
      origen,
      mensaje_origen_id: mensajeOrigenId,
    })
    .select("id")
    .single();
  if (errInsert || !nuevo) {
    if (reemplazadoId) {
      const { data: restaurado, error: errRestaurar } = await supabase
        .from("memorias")
        .update({ estado: "vigente" })
        .eq("id", reemplazadoId)
        .eq("usuario_id", usuarioId)
        .eq("estado", "reemplazado")
        .select("id");
      if (errRestaurar || !restaurado || restaurado.length === 0) {
        // El recuerdo anterior quedó 'reemplazado' sin que exista el nuevo: no se puede dejar pasar en silencio.
        console.error("guardar_memoria: falló el insert y no se pudo restaurar el recuerdo anterior", errRestaurar?.code ?? "sin_filas");
      }
    }
    return null;
  }
  return { id: nuevo.id as string, corrigeId: reemplazadoId, textoAnterior: previo?.texto ?? null };
}

// ---------------------------------------------------------------------------
// Deshacer (tarjeta del chat)
// ---------------------------------------------------------------------------
/**
 * Resultado de deshacer:
 *  - 'ok': se deshizo (y, si corregía a otro, el anterior volvió a ser el vigente);
 *  - 'no_encontrado': ya no estaba vigente (se corrigió o borró desde otro lado), no se tocó nada;
 *  - 'restauracion_fallida': el nuevo quedó borrado pero NO se pudo restaurar el anterior (solo en el camino sin 036);
 *  - 'error': no se pudo saber/hacer por un problema de la base.
 */
export type ResultadoDeshacer = "ok" | "no_encontrado" | "restauracion_fallida" | "error";

/** Deshace un recuerdo recién guardado: queda 'borrado' sin texto y, si corregía a otro, el anterior vuelve a ser el vigente. */
export async function deshacerMemoria(supabase: Cliente, usuarioId: string, id: string): Promise<ResultadoDeshacer> {
  const rpc = await supabase.rpc("deshacer_memoria", { p_id: id });
  if (!rpc.error) {
    const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_deshecho?: boolean } | undefined;
    return fila?.o_deshecho === true ? "ok" : "no_encontrado";
  }
  if (!faltaMigracion(rpc.error)) return "error";

  // Sin 036: primero se borra el nuevo (sin texto) y recién después se restaura el anterior, así nunca hay dos vigentes.
  const { data, error } = await supabase
    .from("memorias")
    .update({ estado: "borrado", texto: null, destacado: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuarioId)
    .eq("estado", "vigente")
    .select("corrige_id");
  if (error) return "error";
  if (!data || data.length === 0) return "no_encontrado";
  const corrigeId = (data[0] as { corrige_id: string | null }).corrige_id;
  if (corrigeId) {
    const { data: restaurado, error: errRestaurar } = await supabase
      .from("memorias")
      .update({ estado: "vigente" })
      .eq("id", corrigeId)
      .eq("usuario_id", usuarioId)
      .eq("estado", "reemplazado")
      .select("id");
    if (errRestaurar || !restaurado || restaurado.length === 0) {
      // El nuevo ya quedó borrado pero el anterior no volvió: no se puede decir "volví a lo que recordaba".
      console.error("deshacer_memoria: no se pudo restaurar el recuerdo anterior", errRestaurar?.code ?? "sin_filas");
      return "restauracion_fallida";
    }
  }
  return "ok";
}

// ---------------------------------------------------------------------------
// buscar_memoria
// ---------------------------------------------------------------------------
export type HitMemoria = {
  fuente: "recuerdo" | "mensaje";
  id: string;
  fecha: string;
  clave: string | null;
  sobre: string | null;
  estado: string | null;
  tipo: string | null;
  texto: string;
};

const MAX_HITS = 6;
const MAX_CHARS_HIT = 280;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(valor: unknown): string | null {
  return typeof valor === "string" && RE_FECHA.test(valor) && !isNaN(new Date(`${valor}T00:00:00Z`).getTime()) ? valor : null;
}

type FilaBusqueda = {
  o_fuente: "recuerdo" | "mensaje";
  o_id: string;
  o_fecha: string;
  o_clave: string | null;
  o_sobre_tipo: string | null;
  o_sobre_perfil_id: string | null;
  o_sobre_nombre: string | null;
  o_estado: string | null;
  o_tipo: string | null;
  o_texto: string | null;
};

/**
 * Búsqueda de texto (Postgres, español, websearch) sobre recuerdos (vigentes y reemplazados, nunca borrados) y
 * mensajes originales no excluidos, por tema y rango de fechas. Con el cliente de sesión: la RLS limita todo
 * al dueño. Devuelve fragmentos cortos con fecha. Ranking y conteo de usos requieren la 036.
 */
export async function buscarMemoria(
  supabase: Cliente,
  usuarioId: string,
  familia: MiembroMinimo[],
  input: { consulta: unknown; sobre?: unknown; desde?: unknown; hasta?: unknown }
): Promise<{ ok: true; hits: HitMemoria[] } | { ok: false; motivo: "apagada" | "consulta" | "sobre" | "no_disponible" | "error" }> {
  const estado = await estadoMemoria(supabase, usuarioId);
  if (!estado.activa) return { ok: false, motivo: "apagada" };

  const consulta = typeof input.consulta === "string" ? input.consulta.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!consulta) return { ok: false, motivo: "consulta" };
  const hayFiltroSobre = input.sobre !== undefined && input.sobre !== null && String(input.sobre).trim() !== "";
  const sobre = hayFiltroSobre ? resolverSobre(input.sobre, usuarioId, familia) : null;
  if (hayFiltroSobre && !sobre) return { ok: false, motivo: "sobre" };
  const desde = fechaValida(input.desde);
  const hasta = fechaValida(input.hasta);

  const rpc = await supabase.rpc("buscar_memoria", {
    p_consulta: consulta,
    p_sobre_tipo: sobre?.tipo ?? null,
    p_sobre_perfil_id: sobre?.perfilId ?? null,
    p_sobre_nombre: sobre?.nombre ?? null,
    p_desde: desde,
    p_hasta: hasta,
    p_limite: MAX_HITS,
  });

  let hits: HitMemoria[];
  if (!rpc.error) {
    hits = ((rpc.data ?? []) as FilaBusqueda[]).map((f) => ({
      fuente: f.o_fuente,
      id: f.o_id,
      fecha: claveDia(f.o_fecha) || f.o_fecha.slice(0, 10),
      clave: f.o_clave,
      sobre:
        f.o_fuente === "recuerdo" && f.o_sobre_tipo
          ? f.o_sobre_tipo === "yo"
            ? "quien te habla"
            : limpiarDato(familia.find((m) => m.id === f.o_sobre_perfil_id)?.nombre ?? f.o_sobre_nombre ?? "otra persona", 40)
          : null,
      estado: f.o_estado,
      tipo: f.o_tipo,
      texto: limpiarDato(f.o_texto ?? "", MAX_CHARS_HIT),
    }));
  } else if (faltaMigracion(rpc.error)) {
    const alternativo = await buscarSinRpc(supabase, usuarioId, familia, consulta, sobre, desde, hasta);
    if (alternativo === null) return { ok: false, motivo: "no_disponible" };
    hits = alternativo;
  } else {
    return { ok: false, motivo: "error" };
  }

  // Uso de los recuerdos devueltos (best effort, solo con 036).
  const ids = hits.filter((h) => h.fuente === "recuerdo").map((h) => h.id);
  if (ids.length > 0) {
    try {
      await supabase.rpc("sumar_uso_memorias", { p_ids: ids });
    } catch {
      // Contador de uso: nunca rompe la búsqueda.
    }
  }
  return { ok: true, hits };
}

// Sin la RPC: filtro de texto de PostgREST sobre cada tabla, ordenado por fecha (sin ranking).
async function buscarSinRpc(
  supabase: Cliente,
  usuarioId: string,
  familia: MiembroMinimo[],
  consulta: string,
  sobre: SobreResuelto | null,
  desde: string | null,
  hasta: string | null
): Promise<HitMemoria[] | null> {
  const inicio = desde ? `${desde}T03:00:00.000Z` : null; // medianoche de Argentina (UTC-3)
  const fin = hasta ? new Date(new Date(`${hasta}T03:00:00.000Z`).getTime() + 24 * 3600 * 1000).toISOString() : null;
  const opciones = { config: "spanish", type: "websearch" as const };

  let qRec = supabase
    .from("memorias")
    .select("id, created_at, clave, sobre_tipo, sobre_perfil_id, sobre_nombre, estado, tipo, texto")
    .eq("usuario_id", usuarioId)
    .in("estado", ["vigente", "reemplazado"])
    .textSearch("busqueda", consulta, opciones);
  if (inicio) qRec = qRec.gte("created_at", inicio);
  if (fin) qRec = qRec.lt("created_at", fin);
  if (sobre) {
    qRec = sobre.tipo === "yo" ? qRec.eq("sobre_tipo", "yo") : sobre.perfilId ? qRec.eq("sobre_perfil_id", sobre.perfilId) : qRec.is("sobre_perfil_id", null).ilike("sobre_nombre", escaparLike(sobre.nombre ?? ""));
  }
  const rec = await qRec.order("created_at", { ascending: false }).limit(MAX_HITS);
  if (rec.error) return faltaMigracion(rec.error) ? null : [];

  let qMsg = supabase
    .from("mensajes_chat")
    .select("id, created_at, contenido")
    .eq("usuario_id", usuarioId)
    .eq("excluido_memoria", false)
    .textSearch("busqueda", consulta, opciones);
  if (inicio) qMsg = qMsg.gte("created_at", inicio);
  if (fin) qMsg = qMsg.lt("created_at", fin);
  const msg = await qMsg.order("created_at", { ascending: false }).limit(MAX_HITS);

  const delRecuerdo = ((rec.data ?? []) as unknown as (FilaBusqueda & { id: string; created_at: string; sobre_tipo: string; sobre_perfil_id: string | null; sobre_nombre: string | null; clave: string; estado: string; tipo: string; texto: string })[]).map(
    (f): HitMemoria => ({
      fuente: "recuerdo",
      id: f.id,
      fecha: claveDia(f.created_at) || f.created_at.slice(0, 10),
      clave: f.clave,
      sobre: f.sobre_tipo === "yo" ? "quien te habla" : limpiarDato(familia.find((m) => m.id === f.sobre_perfil_id)?.nombre ?? f.sobre_nombre ?? "otra persona", 40),
      estado: f.estado,
      tipo: f.tipo,
      texto: limpiarDato(f.texto ?? "", MAX_CHARS_HIT),
    })
  );
  const delMensaje = msg.error
    ? []
    : ((msg.data ?? []) as { id: string; created_at: string; contenido: string }[]).map(
        (f): HitMemoria => ({
          fuente: "mensaje",
          id: f.id,
          fecha: claveDia(f.created_at) || f.created_at.slice(0, 10),
          clave: null,
          sobre: null,
          estado: null,
          tipo: null,
          texto: limpiarDato(f.contenido, MAX_CHARS_HIT),
        })
      );
  return [...delRecuerdo, ...delMensaje].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, MAX_HITS);
}
