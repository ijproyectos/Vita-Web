import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR } from "@/lib/medicamentos/nucleo";
import type { CantidadesBorradas, RangoBorrado } from "./tipos";

type Cliente = SupabaseClient;

const BUCKET_ESTUDIOS = "estudios";

// Fecha de corte (YYYY-MM-DD, calendario de Argentina): lo anterior se borra.
// "Todo" corta en hoy, así las tomas de hoy (el estado del día en curso) se
// conservan.
function fechaCorte(rango: RangoBorrado): string {
  const ahora = new Date();
  if (rango === "all") return fechaEnAR(ahora);
  const d = new Date(ahora);
  if (rango === "1y") d.setFullYear(d.getFullYear() - 1);
  else d.setMonth(d.getMonth() - 6);
  return fechaEnAR(d);
}

const FALTA_FUNCION = (e: { code?: string; message?: string }) =>
  e.code === "42883" || e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message ?? "");

/**
 * Borra los mensajes anteriores al corte y lo que se derivó de ellos. Con 038: RPC atómica `borrar_mensajes_hasta`.
 * Sin 038: primero se saca el resumen (no se manda texto de lo que se va), después los recuerdos cuyo origen es uno de
 * esos mensajes (quedan 'borrado' sin texto) y por último los mensajes. null = falló.
 */
async function borrarMensajesYDerivados(
  supabase: Cliente,
  usuarioId: string,
  corteTs: string
): Promise<{ mensajes: number; recuerdos: number } | null> {
  const rpc = await supabase.rpc("borrar_mensajes_hasta", { p_corte: corteTs });
  if (!rpc.error) {
    const fila = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { o_mensajes?: number; o_recuerdos?: number } | undefined;
    return { mensajes: fila?.o_mensajes ?? 0, recuerdos: fila?.o_recuerdos ?? 0 };
  }
  if (!FALTA_FUNCION(rpc.error)) return null;

  // En tandas (PostgREST corta las listas largas): por cada tanda de mensajes, primero sus recuerdos y después los mensajes.
  // El resumen se saca antes de tocar nada, y solo si hay algo para borrar.
  let mensajes = 0;
  let recuerdos = 0;
  let resumenSacado = false;
  for (let tanda = 0; tanda < 200; tanda++) {
    const { data: viejos, error: errViejos } = await supabase
      .from("mensajes_chat")
      .select("id")
      .eq("usuario_id", usuarioId)
      .lt("created_at", corteTs)
      .limit(500);
    if (errViejos) return null;
    const ids = ((viejos ?? []) as { id: string }[]).map((m) => m.id);
    if (ids.length === 0) break;
    if (!resumenSacado) {
      const resumen = await supabase.from("resumen_conversacion").delete().eq("usuario_id", usuarioId);
      if (resumen.error && !ES_RELACION_INEXISTENTE(resumen.error)) return null;
      resumenSacado = true;
    }
    const derivados = await supabase
      .from("memorias")
      .update({ estado: "borrado", texto: null, destacado: false, updated_at: new Date().toISOString() })
      .eq("usuario_id", usuarioId)
      .neq("estado", "borrado")
      .in("mensaje_origen_id", ids)
      .select("id");
    // Sin 035 no hay recuerdos (relación o columna inexistente): no es un error.
    if (derivados.error && !ES_RELACION_INEXISTENTE(derivados.error) && derivados.error.code !== "42703") return null;
    recuerdos += derivados.data?.length ?? 0;
    const borrados = await supabase.from("mensajes_chat").delete().eq("usuario_id", usuarioId).in("id", ids).select("id");
    if (borrados.error) return null;
    mensajes += borrados.data?.length ?? 0;
  }
  return { mensajes, recuerdos };
}

const ES_RELACION_INEXISTENTE = (e: { code?: string }) => e.code === "42P01" || e.code === "PGRST205";

/**
 * Borra el historial viejo del usuario: tomas, mediciones, estudios (fila +
 * archivo) y conversaciones con vita anteriores a la fecha de corte, junto con los recuerdos que vita sacó de esas conversaciones. NO toca la
 * cuenta, los medicamentos, los turnos, el perfil ni los cuidadores.
 *
 * Usa el cliente de SESIÓN: la RLS (`*_all_self`) solo deja borrar filas
 * propias, y `usuarioId` tiene que ser el de la sesión. Lanza ante un error
 * real; una tabla que todavía no existe cuenta como 0.
 */
export async function borrarHistorial(supabase: Cliente, usuarioId: string, rango: RangoBorrado): Promise<CantidadesBorradas> {
  const corte = fechaCorte(rango);
  // Inicio del día de corte en hora argentina (UTC-3, sin horario de verano).
  const corteTs = `${corte}T03:00:00.000Z`;

  const tomas = await supabase.from("medicamentos_tomas").delete().eq("usuario_id", usuarioId).lt("fecha", corte).select("id");
  if (tomas.error) throw new Error("No se pudieron borrar las tomas.");

  const mediciones = await supabase.from("mediciones").delete().eq("usuario_id", usuarioId).lt("medido_at", corteTs).select("id");
  if (mediciones.error && !ES_RELACION_INEXISTENTE(mediciones.error)) throw new Error("No se pudieron borrar las mediciones.");

  // Estudios: por su fecha (si la tiene) o por la de carga.
  const { data: estudios, error: errEstudios } = await supabase
    .from("estudios")
    .select("id, fecha, created_at, archivo_path")
    .eq("usuario_id", usuarioId);
  if (errEstudios) throw new Error("No se pudieron leer los estudios.");
  const viejos = (estudios ?? []).filter((e) => (e.fecha ?? String(e.created_at).slice(0, 10)) < corte);
  if (viejos.length > 0) {
    const { error } = await supabase
      .from("estudios")
      .delete()
      .eq("usuario_id", usuarioId)
      .in("id", viejos.map((e) => e.id));
    if (error) throw new Error("No se pudieron borrar los estudios.");
    // Primero las filas y después los archivos: si falla el borrado de un
    // archivo queda un huérfano inofensivo, nunca una fila que apunta a nada.
    const rutas = viejos.map((e) => e.archivo_path).filter(Boolean) as string[];
    if (rutas.length > 0) await supabase.storage.from(BUCKET_ESTUDIOS).remove(rutas);
  }

  // Hilo único: una sesión vigente puede tener mensajes viejos, así que el corte también es por mensaje.
  // Los recuerdos que salieron de esos mensajes se borran con ellos y el resumen queda invalidado (puede tener su texto):
  // con la migración 038 es una sola transacción; sin ella se hace en pasos (ver borrarMensajesYDerivados).
  const mensajesViejos = await borrarMensajesYDerivados(supabase, usuarioId, corteTs);
  if (!mensajesViejos) throw new Error("No se pudieron borrar las conversaciones.");
  const recuerdosBorrados = mensajesViejos.recuerdos;

  // Los mensajes y las sesiones se borran en dos pasos que no son atómicos. Si los mensajes ya cayeron y
  // solo falla la limpieza de las sesiones que quedaron vacías, lo importante (los mensajes) está hecho:
  // se informa éxito y el fallo se loguea (sin datos del usuario). Una sesión vacía es inofensiva y la
  // próxima limpieza la levanta. Solo es error si no se borró ningún mensaje y la limpieza también falla.
  const mensajesBorrados = mensajesViejos.mensajes;
  const conversaciones = await supabase.from("sesiones_chat").delete().eq("usuario_id", usuarioId).lt("updated_at", corteTs).select("id");
  if (conversaciones.error) {
    if (mensajesBorrados === 0) throw new Error("No se pudieron borrar las conversaciones.");
    console.warn("borrarHistorial: no se pudieron limpiar las sesiones vacías", conversaciones.error.code ?? "");
  }
  const sesionesBorradas = conversaciones.error ? 0 : (conversaciones.data?.length ?? 0);

  return {
    tomas: tomas.data?.length ?? 0,
    mediciones: mediciones.data?.length ?? 0,
    estudios: viejos.length,
    // "conversaciones" cuenta sesiones borradas; si solo cayeron mensajes sueltos de la sesión vigente (o la
    // limpieza de sesiones falló después de borrar mensajes), cuenta 1: hubo conversación borrada.
    conversaciones: sesionesBorradas || (mensajesBorrados > 0 ? 1 : 0),
    recuerdos: recuerdosBorrados,
    // Hubo mensajes borrados: el resumen de la charla puede tener su texto y hay que rearmarlo.
    resumenInvalidado: mensajesBorrados > 0,
  };
}
