import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { limpiarDato } from "@/lib/ai/limpiar";
import { listarFamilia } from "@/lib/familia/nucleo";
import { claveSobre, etiquetaSobre } from "./claves";
import { descartarConsolidacionPendiente, faltaMigracion, listarContradicciones } from "./nucleo";
import type { Memoria, OrigenMemoria, TipoMemoria } from "./tipos";

// Pantalla "Lo que vita recuerda de vos": ver, dejar de recordar uno, olvidar todo y apagar. Todo con el cliente
// de SESIÓN (RLS owner-only): nunca service_role. Con la migración 040 cada operación es una RPC atómica; sin ella se
// hacen los mismos pasos desde acá. Nunca lanza.
type Cliente = SupabaseClient;

/**
 * Vacía el resumen de la conversación (041). Las RPC de la 040 reemplazadas por la 041 ya lo hacen solas; esto cubre los
 * caminos de respaldo (sin esas RPC), el interruptor y el cierre de "Borrar historial" (se vuelve a invalidar DESPUÉS de
 * borrar las sesiones, para descartar un resumen que se haya armado mientras tanto con mensajes que ya no existen).
 * `false` = falló por algo distinto de "falta la migración".
 */
export async function invalidarResumen(supabase: Cliente): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("invalidar_resumen");
    return !error || faltaMigracion(error);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------
export type RecuerdoVista = {
  id: string;
  texto: string;
  tipo: TipoMemoria;
  /** "De una charla del 12 de octubre". */
  fuente: string;
  /** Pasajeros: "Se olvida el 28 de octubre". */
  vence: string | null;
};
export type GrupoRecuerdos = { clave: string; titulo: string; recuerdos: RecuerdoVista[] };
/** Contradicción pendiente que la persona puede resolver desde la pantalla (043). */
export type ContradiccionVista = { id: string; pregunta: string; textoA: string; textoB: string };
export type VistaMemoria = {
  /** false = falta la migración 038 (la pantalla lo avisa en vez de mostrar un error). */
  disponible: boolean;
  activa: boolean;
  grupos: GrupoRecuerdos[];
  pasajeros: RecuerdoVista[];
  /** Pares que la limpieza nocturna marcó (vacío sin la migración 043). */
  contradicciones: ContradiccionVista[];
};

const ZONA = "America/Argentina/Buenos_Aires";
function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: ZONA }).format(new Date(iso));
}
function fuenteDe(origen: OrigenMemoria, iso: string): string {
  const f = fechaCorta(iso);
  if (origen === "usuario") return `Lo corregiste vos el ${f}`;
  if (origen === "consolidacion") return `Lo ordené yo el ${f}`;
  return `De una charla del ${f}`;
}

type FilaVista = Pick<Memoria, "id" | "sobre_tipo" | "sobre_perfil_id" | "sobre_nombre" | "texto" | "tipo" | "vence_at" | "origen" | "created_at">;

export async function cargarVistaMemoria(supabase: Cliente, usuarioId: string): Promise<VistaMemoria> {
  const vacia: VistaMemoria = { disponible: false, activa: false, grupos: [], pasajeros: [], contradicciones: [] };
  try {
    const { data: perfil, error: errPerfil } = await supabase.from("perfiles").select("memoria_activa").eq("id", usuarioId).maybeSingle();
    if (errPerfil || !perfil) return vacia;
    const { data, error } = await supabase
      .from("memorias")
      .select("id, sobre_tipo, sobre_perfil_id, sobre_nombre, texto, tipo, vence_at, origen, created_at")
      .eq("usuario_id", usuarioId)
      .eq("estado", "vigente")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return vacia;

    let familia: { id: string; nombre: string }[] = [];
    try {
      familia = (await listarFamilia(supabase)).map((f) => ({ id: f.id, nombre: f.nombre }));
    } catch {
      // Sin la lista, los recuerdos de un familiar se rotulan con el nombre que quedó guardado.
    }

    const ahora = Date.now();
    const porSobre = new Map<string, GrupoRecuerdos>();
    const pasajeros: RecuerdoVista[] = [];
    for (const f of (data ?? []) as FilaVista[]) {
      if (!f.texto) continue;
      const vence = f.tipo === "pasajero" && f.vence_at ? new Date(f.vence_at).getTime() : null;
      if (f.tipo === "pasajero" && (vence === null || vence <= ahora)) continue; // ya venció: no cuenta ni se usa
      const vista: RecuerdoVista = {
        id: f.id,
        texto: f.texto,
        tipo: f.tipo,
        fuente: fuenteDe(f.origen, f.created_at),
        vence: f.tipo === "pasajero" && f.vence_at ? `Se olvida el ${fechaCorta(f.vence_at)}` : null,
      };
      if (f.tipo === "pasajero") {
        pasajeros.push(vista);
        continue;
      }
      const clave = claveSobre(f);
      let grupo = porSobre.get(clave);
      if (!grupo) {
        grupo = { clave, titulo: etiquetaSobre(f, familia) ?? "Vos", recuerdos: [] };
        porSobre.set(clave, grupo);
      }
      grupo.recuerdos.push(vista);
    }
    const grupos = [...porSobre.values()].sort((a, b) => (a.clave === "yo" ? -1 : b.clave === "yo" ? 1 : a.titulo.localeCompare(b.titulo, "es")));
    // Solo con la memoria activa (apagada, la limpieza no pregunta nada). Cada texto vuelve a pasar por `limpiarDato`.
    const contradicciones =
      perfil.memoria_activa === true
        ? (await listarContradicciones(supabase, usuarioId, 10)).map((c) => ({
            id: c.id,
            pregunta: limpiarDato(c.pregunta, 300),
            textoA: limpiarDato(c.textoA, 200),
            textoB: limpiarDato(c.textoB, 200),
          }))
        : [];
    return { disponible: true, activa: perfil.memoria_activa === true, grupos, pasajeros, contradicciones };
  } catch {
    return vacia;
  }
}

// ---------------------------------------------------------------------------
// Interruptor
// ---------------------------------------------------------------------------
/**
 * Apagar = no se guardan recuerdos nuevos ni se usan los existentes; no se borran los recuerdos. El resumen de la
 * conversación SÍ se vacía al apagar (se arma de nuevo con lo que se cuente después de prenderla): si no se puede vaciar,
 * no se apaga y el llamador avisa.
 */
export async function cambiarMemoriaActiva(supabase: Cliente, usuarioId: string, activa: boolean): Promise<boolean> {
  try {
    // Apagar descarta lo pendiente de la consolidación (pedidos en vuelo y contradicciones) además de vaciar el resumen.
    if (!activa && !((await invalidarResumen(supabase)) && (await descartarConsolidacionPendiente(supabase)))) return false;
    const { data, error } = await supabase.from("perfiles").update({ memoria_activa: activa }).eq("id", usuarioId).select("id");
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dejar de recordar un recuerdo
// ---------------------------------------------------------------------------
export type ResultadoOlvidar = { estado: "ok"; recuerdos: number; mensajes: number } | { estado: "no_encontrado" } | { estado: "error" };

const BORRADO = () => ({ estado: "borrado", texto: null, destacado: false, updated_at: new Date().toISOString() });

type FilaCadena = { id: string; corrige_id: string | null; mensaje_origen_id: string | null };

/** El recuerdo y sus versiones anteriores (cadena `corrige_id`: un 'reemplazado' también guarda texto). null = no se pudo leer. */
async function cadenaDe(supabase: Cliente, usuarioId: string, id: string): Promise<FilaCadena[] | null> {
  const cadena: FilaCadena[] = [];
  let siguiente: string | null = id;
  for (let i = 0; i < 25 && siguiente; i++) {
    const { data, error } = await supabase
      .from("memorias")
      .select("id, corrige_id, mensaje_origen_id")
      .eq("id", siguiente)
      .eq("usuario_id", usuarioId)
      .maybeSingle();
    if (error) return null;
    if (!data) break;
    const fila = data as FilaCadena;
    if (cadena.some((c) => c.id === fila.id)) break;
    cadena.push(fila);
    siguiente = fila.corrige_id;
  }
  return cadena;
}

/** Excluye de la memoria los mensajes de origen y la respuesta de vita a cada uno (sin la 040). Devuelve cuántos. null = falló. */
async function excluirMensajesDeOrigen(supabase: Cliente, usuarioId: string, origenes: string[]): Promise<number | null> {
  if (origenes.length === 0) return 0;
  const { data: filas, error } = await supabase
    .from("mensajes_chat")
    .select("id, sesion_id, created_at")
    .eq("usuario_id", usuarioId)
    .in("id", origenes);
  if (error) return null;
  const ids = new Set<string>();
  for (const o of (filas ?? []) as { id: string; sesion_id: string; created_at: string }[]) {
    ids.add(o.id);
    // Lo que vita contestó hasta el siguiente mensaje de la persona repite el dato.
    const { data: despues, error: errDespues } = await supabase
      .from("mensajes_chat")
      .select("id, role")
      .eq("usuario_id", usuarioId)
      .eq("sesion_id", o.sesion_id)
      .gt("created_at", o.created_at)
      .order("created_at", { ascending: true })
      .limit(6);
    if (errDespues) return null;
    for (const m of (despues ?? []) as { id: string; role: string }[]) {
      if (m.role === "user") break;
      ids.add(m.id);
    }
  }
  if (ids.size === 0) return 0;
  const { data: excluidos, error: errExcluir } = await supabase
    .from("mensajes_chat")
    .update({ excluido_memoria: true })
    .eq("usuario_id", usuarioId)
    .in("id", [...ids])
    .select("id");
  return errExcluir ? null : (excluidos?.length ?? 0);
}

/**
 * Dejar de recordar: el recuerdo (y sus versiones anteriores) queda borrado sin texto y los mensajes de los que salió
 * quedan `excluido_memoria = true` (siguen visibles en el chat; borrarlos es "Borrar historial").
 */
export async function olvidarRecuerdo(supabase: Cliente, usuarioId: string, id: string): Promise<ResultadoOlvidar> {
  try {
    const rpc = await supabase.rpc("olvidar_memoria", { p_id: id });
    if (!rpc.error) {
      const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_recuerdos?: number; o_mensajes?: number } | undefined;
      if (!fila || (fila.o_recuerdos ?? 0) === 0) return { estado: "no_encontrado" };
      return { estado: "ok", recuerdos: fila.o_recuerdos ?? 0, mensajes: fila.o_mensajes ?? 0 };
    }
    if (!faltaMigracion(rpc.error)) return { estado: "error" };

    // ---- Sin 040: los mismos pasos desde el servidor. ----
    const cadena = await cadenaDe(supabase, usuarioId, id);
    if (!cadena) return { estado: "error" };
    if (cadena.length === 0) return { estado: "no_encontrado" };
    const { data: borradas, error: errBorrar } = await supabase
      .from("memorias")
      .update(BORRADO())
      .eq("usuario_id", usuarioId)
      .neq("estado", "borrado")
      .in("id", cadena.map((c) => c.id))
      .select("id");
    if (errBorrar) return { estado: "error" };
    const recuerdos = borradas?.length ?? 0;
    if (recuerdos === 0) return { estado: "no_encontrado" };
    const mensajes = await excluirMensajesDeOrigen(
      supabase,
      usuarioId,
      cadena.map((c) => c.mensaje_origen_id).filter((x): x is string => !!x)
    );
    if (mensajes === null || !(await invalidarResumen(supabase)) || !(await descartarConsolidacionPendiente(supabase))) return { estado: "error" };
    return { estado: "ok", recuerdos, mensajes };
  } catch {
    return { estado: "error" };
  }
}

// ---------------------------------------------------------------------------
// Olvidar todo
// ---------------------------------------------------------------------------
/**
 * Olvidar todo: todos los recuerdos quedan borrados sin texto y TODOS los mensajes de la persona quedan
 * `excluido_memoria = true`, así `buscar_memoria` no puede volver a encontrar nada de lo dicho hasta ahora. Los mensajes
 * siguen visibles en el historial del chat.
 */
export async function olvidarTodo(supabase: Cliente, usuarioId: string): Promise<{ ok: true; recuerdos: number; mensajes: number } | { ok: false }> {
  try {
    const rpc = await supabase.rpc("olvidar_todo_memoria");
    if (!rpc.error) {
      const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_recuerdos?: number; o_mensajes?: number } | undefined;
      return { ok: true, recuerdos: fila?.o_recuerdos ?? 0, mensajes: fila?.o_mensajes ?? 0 };
    }
    if (!faltaMigracion(rpc.error)) return { ok: false };

    // Sin 040: primero se saca el texto de los recuerdos y después se excluyen los mensajes.
    const { data, error } = await supabase.from("memorias").update(BORRADO()).eq("usuario_id", usuarioId).neq("estado", "borrado").select("id");
    if (error) return { ok: false };
    const { data: excluidos, error: errMensajes } = await supabase
      .from("mensajes_chat")
      .update({ excluido_memoria: true })
      .eq("usuario_id", usuarioId)
      .eq("excluido_memoria", false)
      .select("id");
    if (errMensajes || !(await invalidarResumen(supabase)) || !(await descartarConsolidacionPendiente(supabase))) return { ok: false };
    return { ok: true, recuerdos: data?.length ?? 0, mensajes: excluidos?.length ?? 0 };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Borrar historial: lo que salió de las conversaciones que se borran
// ---------------------------------------------------------------------------
const TANDA = 100;

/**
 * Deja borrado sin texto todo recuerdo que salió de un mensaje de las sesiones con `updated_at` anterior al corte.
 * Se llama ANTES de borrar esas sesiones (después ya no se podrían encontrar sus mensajes). Sin la memoria instalada
 * (tablas inexistentes) no hay nada que borrar y devuelve ok. `ok: false` = no se pudo: el que llama NO debe seguir.
 */
export async function borrarRecuerdosDeSesionesHasta(supabase: Cliente, usuarioId: string, corteIso: string): Promise<{ ok: true; recuerdos: number } | { ok: false }> {
  try {
    const rpc = await supabase.rpc("borrar_recuerdos_de_sesiones_hasta", { p_corte: corteIso });
    if (!rpc.error) return { ok: true, recuerdos: typeof rpc.data === "number" ? rpc.data : 0 };
    if (!faltaMigracion(rpc.error)) return { ok: false };

    // Sin 040: mismos pasos por tandas de sesiones.
    const { data: sesiones, error: errSesiones } = await supabase.from("sesiones_chat").select("id").eq("usuario_id", usuarioId).lt("updated_at", corteIso);
    if (errSesiones) return { ok: false };
    const ids = ((sesiones ?? []) as { id: string }[]).map((s) => s.id);
    if (ids.length > 0 && !((await invalidarResumen(supabase)) && (await descartarConsolidacionPendiente(supabase)))) return { ok: false };
    let recuerdos = 0;
    for (let i = 0; i < ids.length; i += TANDA) {
      const { data: mensajes, error: errMensajes } = await supabase
        .from("mensajes_chat")
        .select("id")
        .eq("usuario_id", usuarioId)
        .in("sesion_id", ids.slice(i, i + TANDA))
        .limit(5000);
      if (errMensajes) return { ok: false };
      const idsMensajes = ((mensajes ?? []) as { id: string }[]).map((m) => m.id);
      for (let j = 0; j < idsMensajes.length; j += TANDA) {
        const { data, error } = await supabase
          .from("memorias")
          .update(BORRADO())
          .eq("usuario_id", usuarioId)
          .neq("estado", "borrado")
          .in("mensaje_origen_id", idsMensajes.slice(j, j + TANDA))
          .select("id");
        if (error) return faltaMigracion(error) ? { ok: true, recuerdos } : { ok: false };
        recuerdos += data?.length ?? 0;
      }
    }
    return { ok: true, recuerdos };
  } catch {
    return { ok: false };
  }
}
