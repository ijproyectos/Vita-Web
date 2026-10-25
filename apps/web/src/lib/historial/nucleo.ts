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

const ES_RELACION_INEXISTENTE = (e: { code?: string }) => e.code === "42P01" || e.code === "PGRST205";

/**
 * Borra el historial viejo del usuario: tomas, mediciones, estudios (fila +
 * archivo) y conversaciones con vita anteriores a la fecha de corte. NO toca la
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
  const mensajesViejos = await supabase.from("mensajes_chat").delete().eq("usuario_id", usuarioId).lt("created_at", corteTs).select("id");
  if (mensajesViejos.error) throw new Error("No se pudieron borrar las conversaciones.");

  // Los mensajes y las sesiones se borran en dos pasos que no son atómicos. Si los mensajes ya cayeron y
  // solo falla la limpieza de las sesiones que quedaron vacías, lo importante (los mensajes) está hecho:
  // se informa éxito y el fallo se loguea (sin datos del usuario). Una sesión vacía es inofensiva y la
  // próxima limpieza la levanta. Solo es error si no se borró ningún mensaje y la limpieza también falla.
  const mensajesBorrados = mensajesViejos.data?.length ?? 0;
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
  };
}
