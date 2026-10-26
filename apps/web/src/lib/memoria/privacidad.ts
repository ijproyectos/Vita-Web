import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listarFamilia } from "@/lib/familia/nucleo";
import { claveSobre, etiquetaSobre, normalizarTexto, type SobreResuelto } from "./claves";
import { faltaMigracion, guardarAtomico, type FilaMemoriaVigente } from "./nucleo";
import type { Memoria, OrigenMemoria, TipoMemoria } from "./tipos";

// Pantalla "Lo que vita recuerda de vos" (M6): ver, corregir, dejar de recordar, eliminar y borrar todo. Todo con el
// cliente de SESIÓN (RLS owner-only): nunca service_role. Con la migración 038 cada operación es una RPC atómica que
// también invalida el resumen; sin ella se hacen los mismos pasos desde acá y, en vez de invalidar, se borra la fila del
// resumen (el chat no manda un resumen que ya no existe). Nunca lanza.
type Cliente = SupabaseClient;

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
export type VistaMemoria = {
  /** false = falta la migración 035 (la pantalla lo avisa en vez de mostrar un error). */
  disponible: boolean;
  activa: boolean;
  grupos: GrupoRecuerdos[];
  pasajeros: RecuerdoVista[];
};

const ZONA = "America/Argentina/Buenos_Aires";
function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: ZONA }).format(new Date(iso));
}
function fuenteDe(origen: OrigenMemoria, iso: string): string {
  const f = fechaCorta(iso);
  if (origen === "usuario") return `Lo corregiste vos el ${f}`;
  if (origen === "consolidacion") return `De varias charlas, al ${f}`;
  return `De una charla del ${f}`;
}

type FilaVista = Pick<Memoria, "id" | "sobre_tipo" | "sobre_perfil_id" | "sobre_nombre" | "texto" | "tipo" | "vence_at" | "origen" | "created_at">;

export async function cargarVistaMemoria(supabase: Cliente, usuarioId: string): Promise<VistaMemoria> {
  const vacia: VistaMemoria = { disponible: false, activa: false, grupos: [], pasajeros: [] };
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
    return { disponible: true, activa: perfil.memoria_activa === true, grupos, pasajeros };
  } catch {
    return vacia;
  }
}

// ---------------------------------------------------------------------------
// Interruptor
// ---------------------------------------------------------------------------
/** Apagar = no se guardan recuerdos nuevos ni se usan los existentes; no se borra nada. */
export async function cambiarMemoriaActiva(supabase: Cliente, usuarioId: string, activa: boolean): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("perfiles").update({ memoria_activa: activa }).eq("id", usuarioId).select("id");
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Corregir
// ---------------------------------------------------------------------------
export type ResultadoCorregir = "ok" | "igual" | "no_encontrado" | "texto_vacio" | "texto_largo" | "error";

/** Igual que una corrección en el chat: el nuevo apunta al anterior (`corrige_id`), el anterior queda 'reemplazado', origen 'usuario'. */
export async function corregirRecuerdo(supabase: Cliente, usuarioId: string, id: string, textoNuevo: unknown): Promise<ResultadoCorregir> {
  try {
    const texto = normalizarTexto(textoNuevo);
    if (!texto.ok) return texto.motivo === "largo" ? "texto_largo" : "texto_vacio";
    const { data, error } = await supabase
      .from("memorias")
      .select("id, sobre_tipo, sobre_perfil_id, sobre_nombre, clave, texto, tipo, vence_at")
      .eq("id", id)
      .eq("usuario_id", usuarioId)
      .eq("estado", "vigente")
      .maybeSingle();
    if (error) return "error";
    if (!data) return "no_encontrado";
    const previo = data as FilaMemoriaVigente & { clave: string };
    if (previo.texto === texto.texto) return "igual";
    // Mismo "sobre quién" que el recuerdo original (no se vuelve a resolver: la clave tiene que coincidir con la del vigente).
    const sobre: SobreResuelto =
      previo.sobre_tipo === "yo"
        ? { tipo: "yo", perfilId: null, nombre: null }
        : previo.sobre_perfil_id
          ? { tipo: "familiar", perfilId: previo.sobre_perfil_id, nombre: previo.sobre_nombre ?? "" }
          : { tipo: "otro", perfilId: null, nombre: previo.sobre_nombre ?? "" };
    if (!sobre) return "error";
    const guardado = await guardarAtomico(supabase, usuarioId, sobre, previo.clave, texto.texto, previo.tipo, previo.tipo === "pasajero" ? previo.vence_at : null, previo, null, "usuario");
    return guardado ? "ok" : "error";
  } catch {
    return "error";
  }
}

// ---------------------------------------------------------------------------
// Dejar de recordar / eliminar
// ---------------------------------------------------------------------------
type FilaCadena = { id: string; corrige_id: string | null; mensaje_origen_id: string | null };

/** El recuerdo y sus versiones anteriores (cadena `corrige_id`, 'reemplazado' también guarda texto). */
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

export type MensajeFuente = { id: string; fecha: string; texto: string };
export type PreviaOlvido = { origen: MensajeFuente[]; relacionados: MensajeFuente[] };

const MAX_CHARS_FUENTE = 160;
function aFuente(f: { id: string; created_at: string; contenido: string }): MensajeFuente {
  const t = f.contenido.replace(/\s+/g, " ").trim();
  return { id: f.id, fecha: fechaCorta(f.created_at), texto: t.length > MAX_CHARS_FUENTE ? `${t.slice(0, MAX_CHARS_FUENTE)}…` : t };
}

/**
 * Qué mensajes se verían alcanzados: el de origen (siempre) y, para que la persona confirme, otros suyos que hablan del
 * mismo tema (búsqueda de texto). Solo mensajes de la persona, sin los ya excluidos. null = no se pudo leer.
 */
export async function previaOlvido(supabase: Cliente, usuarioId: string, id: string): Promise<PreviaOlvido | null> {
  try {
    const cadena = await cadenaDe(supabase, usuarioId, id);
    if (!cadena || cadena.length === 0) return null;
    const idsOrigen = cadena.map((c) => c.mensaje_origen_id).filter((x): x is string => !!x);
    let origen: MensajeFuente[] = [];
    if (idsOrigen.length > 0) {
      const { data, error: errOrigen } = await supabase.from("mensajes_chat").select("id, created_at, contenido").eq("usuario_id", usuarioId).in("id", idsOrigen);
      // Sin ver de qué mensajes salió no se puede decir qué se va a borrar: la pantalla no deja confirmar.
      if (errOrigen) return null;
      origen = ((data ?? []) as { id: string; created_at: string; contenido: string }[]).map(aFuente);
    }

    // Tema: palabras con peso del texto del recuerdo y su clave, unidas con "or" (websearch).
    const { data: m } = await supabase.from("memorias").select("texto, clave").eq("id", id).eq("usuario_id", usuarioId).maybeSingle();
    const base = `${(m as { texto?: string | null } | null)?.texto ?? ""} ${((m as { clave?: string } | null)?.clave ?? "").replace(/_/g, " ")}`;
    const palabras = [...new Set(base.toLowerCase().match(/[a-záéíóúüñ]{4,}/g) ?? [])].slice(0, 6);
    let relacionados: MensajeFuente[] = [];
    if (palabras.length > 0) {
      const { data, error } = await supabase
        .from("mensajes_chat")
        .select("id, created_at, contenido")
        .eq("usuario_id", usuarioId)
        .eq("role", "user")
        .eq("excluido_memoria", false)
        .textSearch("busqueda", palabras.join(" or "), { config: "spanish", type: "websearch" })
        .order("created_at", { ascending: false })
        .limit(8);
      if (!error) {
        const ya = new Set(idsOrigen);
        relacionados = ((data ?? []) as { id: string; created_at: string; contenido: string }[]).filter((f) => !ya.has(f.id)).slice(0, 5).map(aFuente);
      }
    }
    return { origen, relacionados };
  } catch {
    return null;
  }
}

export type ResultadoOlvidar = { estado: "ok"; recuerdos: number; mensajes: number } | { estado: "no_encontrado" } | { estado: "error" };

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quita el resumen vigente (camino sin 038: no se manda un resumen que pudo copiar lo olvidado). */
async function borrarFilaResumen(supabase: Cliente, usuarioId: string): Promise<boolean> {
  const { error } = await supabase.from("resumen_conversacion").delete().eq("usuario_id", usuarioId);
  return !error || faltaMigracion(error);
}

/**
 * Dejar de recordar (`eliminar = false`: recuerdo borrado sin texto + sus mensajes de origen y los que la persona
 * confirmó quedan excluidos) o eliminar (`true`: lo mismo pero los mensajes se borran, y los recuerdos que salieron de
 * ellos). En los dos el resumen queda invalidado en la misma transacción; el que llama encola 'regenerar'.
 */
export async function olvidarRecuerdo(
  supabase: Cliente,
  usuarioId: string,
  id: string,
  eliminar: boolean,
  mensajesConfirmados: string[]
): Promise<ResultadoOlvidar> {
  try {
    const confirmados = [...new Set(mensajesConfirmados.filter((m) => RE_UUID.test(m)))].slice(0, 20);
    const rpc = await supabase.rpc("olvidar_memoria", { p_id: id, p_mensajes: confirmados, p_eliminar: eliminar });
    if (!rpc.error) {
      const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_recuerdos?: number; o_mensajes?: number } | undefined;
      if (!fila || (fila.o_recuerdos ?? 0) === 0) return { estado: "no_encontrado" };
      return { estado: "ok", recuerdos: fila.o_recuerdos ?? 0, mensajes: fila.o_mensajes ?? 0 };
    }
    if (!faltaMigracion(rpc.error)) return { estado: "error" };

    // ---- Sin 038: los mismos pasos desde el servidor. El resumen se borra PRIMERO. ----
    const cadena = await cadenaDe(supabase, usuarioId, id);
    if (!cadena || cadena.length === 0) return { estado: "no_encontrado" };
    if (!(await borrarFilaResumen(supabase, usuarioId))) return { estado: "error" };

    let fuentes = new Set([...cadena.map((c) => c.mensaje_origen_id).filter((x): x is string => !!x), ...confirmados]);
    // El resto de cada turno (mismo pedido): la respuesta de vita repite el dato.
    if (fuentes.size > 0) {
      const { data: propios } = await supabase.from("mensajes_chat").select("id, pedido_id").eq("usuario_id", usuarioId).in("id", [...fuentes]);
      const pedidos = [...new Set(((propios ?? []) as { pedido_id: string | null }[]).map((p) => p.pedido_id).filter((x): x is string => !!x))];
      const propiosIds = new Set(((propios ?? []) as { id: string }[]).map((p) => p.id));
      if (pedidos.length > 0) {
        const { data: turno } = await supabase.from("mensajes_chat").select("id").eq("usuario_id", usuarioId).in("pedido_id", pedidos);
        for (const t of (turno ?? []) as { id: string }[]) propiosIds.add(t.id);
      }
      fuentes = propiosIds;
    }
    const idsFuentes = [...fuentes];
    const borrar = { estado: "borrado", texto: null, destacado: false, updated_at: new Date().toISOString() };
    const { data: borradas, error: errBorrar } = await supabase
      .from("memorias")
      .update(borrar)
      .eq("usuario_id", usuarioId)
      .neq("estado", "borrado")
      .in("id", cadena.map((c) => c.id))
      .select("id");
    if (errBorrar) return { estado: "error" };
    let recuerdos = borradas?.length ?? 0;
    let mensajes = 0;
    if (idsFuentes.length > 0) {
      if (eliminar) {
        const { data: derivadas } = await supabase.from("memorias").update(borrar).eq("usuario_id", usuarioId).neq("estado", "borrado").in("mensaje_origen_id", idsFuentes).select("id");
        recuerdos += derivadas?.length ?? 0;
        const { data: del, error } = await supabase.from("mensajes_chat").delete().eq("usuario_id", usuarioId).in("id", idsFuentes).select("id");
        if (error) return { estado: "error" };
        mensajes = del?.length ?? 0;
      } else {
        const { data: exc, error } = await supabase.from("mensajes_chat").update({ excluido_memoria: true }).eq("usuario_id", usuarioId).in("id", idsFuentes).select("id");
        if (error) return { estado: "error" };
        mensajes = exc?.length ?? 0;
      }
    }
    return recuerdos > 0 ? { estado: "ok", recuerdos, mensajes } : { estado: "no_encontrado" };
  } catch {
    return { estado: "error" };
  }
}

/** Borrar todo lo que vita recuerda: todos los recuerdos sin texto y resumen en blanco. Los mensajes no se tocan. */
export async function olvidarTodo(supabase: Cliente, usuarioId: string): Promise<{ ok: true; recuerdos: number } | { ok: false }> {
  try {
    const rpc = await supabase.rpc("olvidar_todo_memoria");
    if (!rpc.error) {
      const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_recuerdos?: number } | undefined;
      return { ok: true, recuerdos: fila?.o_recuerdos ?? 0 };
    }
    if (!faltaMigracion(rpc.error)) return { ok: false };
    if (!(await borrarFilaResumen(supabase, usuarioId))) return { ok: false };
    const { data, error } = await supabase
      .from("memorias")
      .update({ estado: "borrado", texto: null, destacado: false, updated_at: new Date().toISOString() })
      .eq("usuario_id", usuarioId)
      .neq("estado", "borrado")
      .select("id");
    return error ? { ok: false } : { ok: true, recuerdos: data?.length ?? 0 };
  } catch {
    return { ok: false };
  }
}
