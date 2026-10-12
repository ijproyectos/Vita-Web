// Tipos y helpers puros del inventario de pastillas — sin `server-only` a
// propósito: los componentes de cliente (badge, flujo de conteo) importan de
// acá las mismas reglas (umbral, clave de agrupación) que usa el núcleo.

export const UMBRAL_ALERTA_DEFAULT = 5;
export const STOCK_MAXIMO = 9999;
export const PASTILLAS_POR_TOMA_MAXIMO = 20;

export type Inventario = {
  id: string;
  usuario_id: string;
  nombre: string;
  dosis: string | null;
  stock: number;
  pastillas_por_toma: number;
  umbral_alerta: number;
  updated_at: string;
};

// Subconjunto serializable que viaja a componentes de cliente / badges.
export type ResumenStock = {
  stock: number;
  umbral: number;
};

/**
 * Un mismo medicamento tomado en varios momentos son VARIAS filas de
 * `medicamentos` (sin columna de agrupación). Esta clave (nombre + dosis,
 * sin mayúsculas ni espacios de más) es lo que las identifica como "el
 * mismo medicamento" — idéntica a la expresión del índice único
 * `idx_inventario_unico` de la migración 014.
 */
export function claveMedicamento(nombre: string, dosis: string | null | undefined): string {
  return `${nombre.trim().toLowerCase()}|${(dosis ?? "").trim().toLowerCase()}`;
}

/** "Poco stock" = menos pastillas que el umbral (por defecto, menos de 5). */
export function esStockBajo(stock: number, umbral: number): boolean {
  return stock < umbral;
}

export function textoQuedan(stock: number): string {
  if (stock <= 0) return "No quedan pastillas";
  return stock === 1 ? "Queda 1 pastilla" : `Quedan ${stock} pastillas`;
}

/** Entero acotado a [min, max]; cualquier cosa no numérica devuelve `min`. */
export function acotarEntero(valor: unknown, min: number, max: number): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const UNIDADES_DOSIS = ["mg", "ml", "gotas", "UI", "comp."] as const;

/**
 * Separa una dosis leída de un blister ("500 mg", "850mg", "5 ml") en el
 * número y la unidad que usa el form de medicamentos (`dosis` guarda solo el
 * número; la unidad va aparte). Si la unidad no es una de las soportadas
 * (ej. "mcg"), devuelve el texto entero como valor y unidad null — mejor
 * conservar el dato que etiquetarlo con una unidad equivocada.
 */
export function separarDosis(texto: string | null | undefined): { valor: string; unidad: string | null } {
  const t = (texto ?? "").trim();
  if (!t) return { valor: "", unidad: null };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/);
  if (!m) return { valor: t, unidad: null };
  const numero = m[1].replace(",", ".");
  const unidadCruda = (m[2] ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!unidadCruda) return { valor: numero, unidad: null };
  const unidad = UNIDADES_DOSIS.find((u) => u.toLowerCase().replace(/\.$/, "") === unidadCruda);
  return unidad ? { valor: numero, unidad } : { valor: t, unidad: null };
}
