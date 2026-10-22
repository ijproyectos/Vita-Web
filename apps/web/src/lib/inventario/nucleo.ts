import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PASTILLAS_POR_TOMA_MAXIMO,
  STOCK_MAXIMO,
  acotarEntero,
  claveMedicamento,
  esStockBajo,
  type Inventario,
} from "./tipos";

// Núcleo del inventario de pastillas. Importado por lib/medicamentos/nucleo.ts
// (descuento al marcar tomada) — por eso NO importa de ahí: la dependencia va
// en una sola dirección y las lecturas de `medicamentos` son directas.
type Cliente = SupabaseClient;

export type GrupoMedicamento = {
  clave: string;
  nombre: string;
  dosis: string | null;
  /** Id de una de las filas del grupo — sirve de "handle" para la UI. */
  representanteId: string;
  medicamentoIds: string[];
  /** Tomas por día de calendario (una fila diaria = 1; días puntuales = n/7). */
  tomasPorDia: number;
  inventario: Inventario | null;
};

type FilaMed = {
  id: string;
  nombre: string;
  dosis: string | null;
  dias_recurrentes: string[] | null;
  inventario_id: string | null;
};

export async function listar(supabase: Cliente, usuarioId: string): Promise<Inventario[]> {
  const { data, error } = await supabase
    .from("inventario_pastillas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudo leer el inventario de pastillas: ${error.message}`);
  return (data ?? []) as Inventario[];
}

/**
 * Variante para pantallas que solo MUESTRAN el stock (badges, banners): si la
 * lectura falla (p. ej. migración 014 todavía sin aplicar) degrada a "sin
 * datos de stock" en vez de romper Home/Rutina/Mi Salud.
 */
export async function listarSeguro(supabase: Cliente, usuarioId: string): Promise<Inventario[]> {
  try {
    return await listar(supabase, usuarioId);
  } catch {
    return [];
  }
}

/** Inventarios por debajo de su umbral (menos de 5 por defecto). */
export function filtrarStockBajo(inventarios: Inventario[]): Inventario[] {
  return inventarios.filter((i) => esStockBajo(i.stock, i.umbral_alerta));
}

/**
 * Agrupa las filas de `medicamentos` del usuario por medicamento real
 * (nombre+dosis) y les adjunta su inventario, si lo tienen.
 */
export async function listarGrupos(supabase: Cliente, usuarioId: string): Promise<GrupoMedicamento[]> {
  const [{ data, error }, inventarios] = await Promise.all([
    supabase
      .from("medicamentos")
      .select("id, nombre, dosis, dias_recurrentes, inventario_id")
      .eq("usuario_id", usuarioId)
      .order("hora_programada", { ascending: true }),
    listar(supabase, usuarioId),
  ]);
  if (error) throw new Error(`No se pudieron leer los medicamentos: ${error.message}`);

  const inventarioPorClave = new Map(inventarios.map((i) => [claveMedicamento(i.nombre, i.dosis), i]));
  const inventarioPorId = new Map(inventarios.map((i) => [i.id, i]));

  const grupos = new Map<string, GrupoMedicamento>();
  for (const fila of (data ?? []) as FilaMed[]) {
    const clave = claveMedicamento(fila.nombre, fila.dosis);
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        clave,
        nombre: fila.nombre,
        dosis: fila.dosis,
        representanteId: fila.id,
        medicamentoIds: [],
        tomasPorDia: 0,
        inventario:
          (fila.inventario_id ? inventarioPorId.get(fila.inventario_id) : undefined) ??
          inventarioPorClave.get(clave) ??
          null,
      };
      grupos.set(clave, grupo);
    }
    grupo.medicamentoIds.push(fila.id);
    const dias = fila.dias_recurrentes?.length ?? 0;
    grupo.tomasPorDia += dias === 0 ? 1 : dias / 7;
  }

  return [...grupos.values()];
}

/** Como `listarGrupos` pero ante cualquier fallo (migración 014 sin aplicar) devuelve []. */
export async function listarGruposSeguro(supabase: Cliente, usuarioId: string): Promise<GrupoMedicamento[]> {
  try {
    return await listarGrupos(supabase, usuarioId);
  } catch {
    return [];
  }
}

/** Días que alcanza el stock al ritmo actual; null si no se puede derivar. */
export function diasQueAlcanza(grupo: GrupoMedicamento): number | null {
  if (!grupo.inventario) return null;
  const porDia = grupo.tomasPorDia * grupo.inventario.pastillas_por_toma;
  if (porDia <= 0) return null;
  return Math.floor(grupo.inventario.stock / porDia);
}

/**
 * Id del inventario ya existente para un medicamento (nombre+dosis), o null.
 * Lo usa `agregarMultiMomento` para que filas nuevas del mismo medicamento
 * nazcan ya enganchadas al stock compartido. Nunca lanza: si falla, el
 * medicamento se crea igual, solo que sin control de pastillas.
 */
export async function buscarInventarioId(
  supabase: Cliente,
  usuarioId: string,
  nombre: string,
  dosis: string | null | undefined
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("inventario_pastillas")
      .select("id, nombre, dosis")
      .eq("usuario_id", usuarioId);
    const clave = claveMedicamento(nombre, dosis);
    const match = (data ?? []).find((i) => claveMedicamento(i.nombre as string, i.dosis as string | null) === clave);
    return (match?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Crea o actualiza el inventario del medicamento al que pertenece
 * `medicamentoId` y engancha TODAS las filas hermanas (mismo nombre+dosis) a
 * ese único stock. Re-contar es el mismo camino: pisa el stock.
 */
export async function guardar(
  supabase: Cliente,
  usuarioId: string,
  datos: { medicamentoId: string; stock: number; pastillasPorToma: number }
): Promise<Inventario> {
  const stock = acotarEntero(datos.stock, 0, STOCK_MAXIMO);
  const porToma = acotarEntero(datos.pastillasPorToma, 1, PASTILLAS_POR_TOMA_MAXIMO);

  const { data: filas, error: errFilas } = await supabase
    .from("medicamentos")
    .select("id, nombre, dosis, dias_recurrentes, inventario_id")
    .eq("usuario_id", usuarioId);
  if (errFilas) throw new Error(`No se pudieron leer los medicamentos: ${errFilas.message}`);

  const todas = (filas ?? []) as FilaMed[];
  const base = todas.find((f) => f.id === datos.medicamentoId);
  if (!base) throw new Error("No encontramos ese medicamento.");

  const clave = claveMedicamento(base.nombre, base.dosis);
  const hermanas = todas.filter((f) => claveMedicamento(f.nombre, f.dosis) === clave);

  const existentes = await listar(supabase, usuarioId);
  const existente = existentes.find((i) => claveMedicamento(i.nombre, i.dosis) === clave);

  const cambios = { stock, pastillas_por_toma: porToma, updated_at: new Date().toISOString() };

  async function actualizar(id: string): Promise<Inventario> {
    const { data, error } = await supabase
      .from("inventario_pastillas")
      .update(cambios)
      .eq("id", id)
      .eq("usuario_id", usuarioId)
      .select()
      .single();
    if (error) throw new Error(`No se pudo guardar el stock: ${error.message}`);
    return data as Inventario;
  }

  let inventario: Inventario;
  if (existente) {
    inventario = await actualizar(existente.id);
  } else {
    const { data, error } = await supabase
      .from("inventario_pastillas")
      .insert({ usuario_id: usuarioId, nombre: base.nombre, dosis: base.dosis, ...cambios })
      .select()
      .single();
    if (error) {
      // 23505: otra request creó el mismo inventario entre el listado y el
      // insert (índice único idx_inventario_unico) — se reutiliza esa fila.
      if (error.code === "23505") {
        const recargados = await listar(supabase, usuarioId);
        const ganador = recargados.find((i) => claveMedicamento(i.nombre, i.dosis) === clave);
        if (!ganador) throw new Error(`No se pudo guardar el stock: ${error.message}`);
        inventario = await actualizar(ganador.id);
      } else {
        throw new Error(`No se pudo guardar el stock: ${error.message}`);
      }
    } else {
      inventario = data as Inventario;
    }
  }

  const { error: errLink } = await supabase
    .from("medicamentos")
    .update({ inventario_id: inventario.id })
    .eq("usuario_id", usuarioId)
    .in(
      "id",
      hermanas.map((h) => h.id)
    );
  if (errLink) throw new Error(`No se pudo vincular el stock al medicamento: ${errLink.message}`);

  return inventario;
}

/**
 * Mueve el stock una toma (-1 = tomada, +1 = desmarcada) vía la RPC atómica
 * `ajustar_stock_pastillas`, que multiplica por `pastillas_por_toma` del lado
 * de la DB (funciona igual para el dueño y para un cuidador vinculado). Nunca
 * lanza: marcar una toma no debe fallar porque la contabilidad del stock
 * falló; devuelve el stock nuevo o null.
 */
export async function ajustarStock(supabase: Cliente, inventarioId: string, direccion: 1 | -1): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("ajustar_stock_pastillas", {
      p_inventario_id: inventarioId,
      p_direccion: direccion,
    });
    if (error) return null;
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}
