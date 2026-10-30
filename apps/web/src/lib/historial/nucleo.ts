import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR } from "@/lib/medicamentos/nucleo";
import { borrarRecuerdosDeSesionesHasta, invalidarResumen } from "@/lib/memoria/privacidad";
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
 * archivo) y conversaciones con vita anteriores a la fecha de corte, junto con los recuerdos que vita sacó de ellas. NO toca la
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

  // Lo que vita recordó de las conversaciones que se van se borra primero (después ya no se encuentran sus mensajes).
  // Si no se puede, no se borran las conversaciones: nunca queda texto derivado sin su origen.
  const recuerdos = await borrarRecuerdosDeSesionesHasta(supabase, usuarioId, corteTs);
  if (!recuerdos.ok) throw new Error("No se pudo borrar lo que vita recordaba de esas conversaciones.");

  const conversaciones = await supabase.from("sesiones_chat").delete().eq("usuario_id", usuarioId).lt("updated_at", corteTs).select("id");
  if (conversaciones.error) throw new Error("No se pudieron borrar las conversaciones.");
  // Un resumen armado entre la invalidación de arriba y el borrado podría traer texto de lo que se acaba de borrar.
  if ((conversaciones.data?.length ?? 0) > 0) await invalidarResumen(supabase);

  return {
    tomas: tomas.data?.length ?? 0,
    mediciones: mediciones.data?.length ?? 0,
    estudios: viejos.length,
    conversaciones: conversaciones.data?.length ?? 0,
    recuerdos: recuerdos.recuerdos,
  };
}
