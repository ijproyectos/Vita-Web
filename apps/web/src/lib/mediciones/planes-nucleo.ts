import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaHoyAR } from "@/lib/medicamentos/cuando";
import { claveNombreOtra, esTipoRegistrable } from "./tipos";
import { diasDesde, horariosDesde, validarPlan, type EntradaPlan, type Monitoreo } from "./plan";

// Mismo patrón que `nucleo.ts`: la RLS decide el acceso real.
type Cliente = SupabaseClient;

export function aMonitoreo(fila: Record<string, unknown>): Monitoreo | null {
  if (!esTipoRegistrable(fila.tipo)) return null;
  const horarios = horariosDesde(fila.horarios);
  if (horarios.length === 0) return null;
  return {
    id: String(fila.id),
    usuario_id: String(fila.usuario_id),
    tipo: fila.tipo,
    nombre_otra: typeof fila.nombre_otra === "string" ? fila.nombre_otra : null,
    unidad_otra: typeof fila.unidad_otra === "string" ? fila.unidad_otra : null,
    horarios,
    dias_recurrentes: diasDesde(fila.dias_recurrentes),
    fecha_fin: typeof fila.fecha_fin === "string" ? fila.fecha_fin.slice(0, 10) : null,
  };
}

/** Sin la migración 053, o si falla la lectura, no hay planes: la pantalla sigue andando. */
export async function listarSeguro(supabase: Cliente, usuarioId: string): Promise<Monitoreo[]> {
  const { data, error } = await supabase.from("monitoreos").select("*").eq("usuario_id", usuarioId);
  if (error) return [];
  return (data ?? []).map(aMonitoreo).filter((m): m is Monitoreo => m !== null);
}

/** Una métrica tiene un solo plan: guardarla de nuevo lo reemplaza. Lanza con un mensaje en español. */
export async function guardar(supabase: Cliente, usuarioId: string, entrada: EntradaPlan): Promise<void> {
  const validado = validarPlan(entrada, fechaHoyAR());
  if (!validado.ok) throw new Error(validado.message);
  const d = validado.datos;

  const { data: existentes, error: errorLectura } = await supabase
    .from("monitoreos")
    .select("id, nombre_otra")
    .eq("usuario_id", usuarioId)
    .eq("tipo", d.tipo);
  if (errorLectura) throw new Error("No se pudo guardar el monitoreo. Probá de nuevo en un rato.");

  const previo = (existentes ?? []).find((e) => claveNombreOtra(e.nombre_otra) === claveNombreOtra(d.nombre_otra));
  const { error } = previo
    ? await supabase.from("monitoreos").update({ ...d, updated_at: new Date().toISOString() }).eq("id", previo.id).eq("usuario_id", usuarioId)
    : await supabase.from("monitoreos").insert({ ...d, usuario_id: usuarioId });
  if (error) throw new Error("No se pudo guardar el monitoreo. Probá de nuevo en un rato.");
}

export async function quitar(supabase: Cliente, usuarioId: string, id: string): Promise<void> {
  const { error } = await supabase.from("monitoreos").delete().eq("id", id).eq("usuario_id", usuarioId);
  if (error) throw new Error("No se pudo quitar el monitoreo. Probá de nuevo en un rato.");
}
