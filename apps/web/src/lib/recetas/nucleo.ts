import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaDeHoyISO } from "@/lib/rutina/formato";

// Recetas por retirar (migración 023, "Nueva receta · retirar en farmacia" de
// Rutina → Próximos). Hoy solo se LISTAN: el diseño no define una pantalla de
// alta. Mientras la tabla no exista, `listarProximasSeguro` devuelve [].
type Cliente = SupabaseClient;

export type Receta = {
  id: string;
  usuario_id: string;
  nombre: string;
  detalle: string | null;
  /** "YYYY-MM-DD": día en que hay que retirarla. */
  fecha: string;
  retirada: boolean;
};

export async function listarProximasSeguro(supabase: Cliente, usuarioId: string): Promise<Receta[]> {
  try {
    const { data, error } = await supabase
      .from("recetas")
      .select("id, usuario_id, nombre, detalle, fecha, retirada")
      .eq("usuario_id", usuarioId)
      .eq("retirada", false)
      .gte("fecha", fechaDeHoyISO())
      .order("fecha", { ascending: true })
      .limit(20);
    if (error) return [];
    return data as Receta[];
  } catch {
    return [];
  }
}
