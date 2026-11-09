import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validarMedicion,
  esContextoGlucemia,
  esTipoRegistrable,
  type EntradaMedicion,
  type Medicion,
  type TipoRegistrable,
} from "./tipos";

// Mismo patrón que lib/turnos/nucleo.ts — funciones puras
// (supabase, usuarioId, ...). La RLS decide el acceso real (dueño, o
// cuidador vinculado: lee cualquiera, escribe `editar`).
type Cliente = SupabaseClient;

type Fila = Record<string, unknown>;

// `numeric` llega como número por PostgREST, pero se coerciona igual: un
// valor raro nunca debe romper la pantalla.
function aMedicion(fila: Fila): Medicion | null {
  if (!esTipoRegistrable(fila.tipo)) return null;
  const valor = Number(fila.valor);
  if (!Number.isFinite(valor)) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    id: String(fila.id),
    usuario_id: String(fila.usuario_id),
    tipo: fila.tipo,
    nombre_otra: typeof fila.nombre_otra === "string" ? fila.nombre_otra : null,
    unidad_otra: typeof fila.unidad_otra === "string" ? fila.unidad_otra : null,
    valor,
    valor_secundario: num(fila.valor_secundario),
    pulso: num(fila.pulso),
    contexto: esContextoGlucemia(fila.contexto) ? fila.contexto : null,
    medido_at: String(fila.medido_at),
    notas: typeof fila.notas === "string" ? fila.notas : null,
    created_at: String(fila.created_at),
  };
}

function aMediciones(data: Fila[] | null): Medicion[] {
  return (data ?? []).map(aMedicion).filter((m): m is Medicion => m !== null);
}

/** Últimas mediciones de todos los tipos, más nuevas primero. */
export async function listarRecientes(supabase: Cliente, usuarioId: string, limite = 300): Promise<Medicion[]> {
  const { data, error } = await supabase
    .from("mediciones")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("medido_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las mediciones: ${error.message}`);
  return aMediciones(data as Fila[]);
}

export async function listarPorTipo(
  supabase: Cliente,
  usuarioId: string,
  tipo: TipoRegistrable,
  limite = 100
): Promise<Medicion[]> {
  const { data, error } = await supabase
    .from("mediciones")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo)
    .order("medido_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las mediciones: ${error.message}`);
  return aMediciones(data as Fila[]);
}

/**
 * Variantes que nunca lanzan: si la tabla todavía no existe (migración 022 sin
 * aplicar) o la lectura falla, la pantalla muestra el estado vacío.
 */
export async function listarRecientesSeguro(supabase: Cliente, usuarioId: string): Promise<Medicion[]> {
  try {
    return await listarRecientes(supabase, usuarioId);
  } catch {
    return [];
  }
}

export async function listarPorTipoSeguro(
  supabase: Cliente,
  usuarioId: string,
  tipo: TipoRegistrable
): Promise<Medicion[]> {
  try {
    return await listarPorTipo(supabase, usuarioId, tipo);
  } catch {
    return [];
  }
}

/** Valida y guarda. Lanza con un mensaje en español si algo falla. */
export async function agregar(supabase: Cliente, usuarioId: string, entrada: EntradaMedicion): Promise<Medicion> {
  const validado = validarMedicion(entrada);
  if (!validado.ok) throw new Error(validado.message);
  const d = validado.datos;

  const fila: Record<string, unknown> = {
    usuario_id: usuarioId,
    tipo: d.tipo,
    // Sin la 053 estas columnas no existen: solo se mandan en una "Otra".
    ...(d.tipo === "otra" ? { nombre_otra: d.nombreOtra, unidad_otra: d.unidadOtra } : {}),
    valor: d.valor,
    valor_secundario: d.valorSecundario,
    pulso: d.pulso,
    contexto: d.contexto,
    notas: d.notas,
  };
  // Sin fecha explícita la DB pone now().
  if (d.medidoAt) fila.medido_at = d.medidoAt;

  const { data, error } = await supabase.from("mediciones").insert(fila).select("*").single();
  if (error) throw new Error(`No se pudo guardar la medición: ${error.message}`);
  const medicion = aMedicion(data as Fila);
  if (!medicion) throw new Error("La medición se guardó pero no se pudo leer de vuelta.");
  return medicion;
}

export async function eliminar(supabase: Cliente, usuarioId: string, medicionId: string): Promise<void> {
  const { error } = await supabase.from("mediciones").delete().eq("id", medicionId).eq("usuario_id", usuarioId);
  if (error) throw new Error(`No se pudo eliminar la medición: ${error.message}`);
}
