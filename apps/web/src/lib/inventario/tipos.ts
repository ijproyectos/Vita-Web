import { cantidadStock } from "@/lib/medicamentos/forma";
import { separarNombreDroga } from "@/lib/medicamentos/nombre";
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

type Candidato = { clave: string; nombre: string; dosis: string | null };

/**
 * A qué medicamento ya cargado corresponde un conteo por foto. Primero la
 * clave exacta; si no, compara el nombre comercial y la droga sin el
 * paréntesis (el blister dice "Forxiga" y la persona guardó "Forxiga
 * (Dapagliflozina)"). Sin dosis solo enlaza si hay UNO solo con ese nombre;
 * con dosis, tiene que coincidir también la dosis.
 */
export function buscarMedicamentoContado<T extends Candidato>(
  candidatos: T[],
  nombre: string,
  dosis: string | null
): T | undefined {
  const exacto = candidatos.find((c) => c.clave === claveMedicamento(nombre, dosis));
  if (exacto) return exacto;

  const norma = (t: string) => t.trim().toLowerCase();
  const buscado = separarNombreDroga(nombre);
  const nombresBuscados = new Set([buscado.nombre, buscado.droga].filter((x): x is string => !!x).map(norma));
  const mismoNombre = candidatos.filter((c) => {
    const { nombre: n, droga } = separarNombreDroga(c.nombre);
    return [n, droga].some((x) => x !== null && nombresBuscados.has(norma(x)));
  });
  if (dosis) return mismoNombre.find((c) => norma(c.dosis ?? "") === norma(dosis));
  return mismoNombre.length === 1 ? mismoNombre[0] : undefined;
}

/** "Poco stock" = menos pastillas que el umbral (por defecto, menos de 5). */
export function esStockBajo(stock: number, umbral: number): boolean {
  return stock < umbral;
}

/** "Quedan 12,5 pastillas", "Queda 1 ml". Sin forma (o sin la migración 052) son pastillas. */
export function textoQuedan(stock: number, forma?: unknown): string {
  if (stock <= 0) return forma && forma !== "pastilla" ? "No queda nada" : "No quedan pastillas";
  return `${stock === 1 ? "Queda" : "Quedan"} ${cantidadStock(forma, stock)}`;
}

/** Entero acotado a [min, max]; cualquier cosa no numérica devuelve `min`. */
/** Stock válido: admite medias pastillas y ml, con dos decimales. */
export function acotarStock(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(STOCK_MAXIMO, Math.max(0, Math.round(n * 100) / 100));
}

export function acotarEntero(valor: unknown, min: number, max: number): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const UNIDADES_DOSIS = ["mg", "mcg", "ml", "gotas", "UI", "comp."] as const;

/**
 * Separa una dosis leída de un blister ("500 mg", "850mg", "5 ml") en el
 * número y la unidad que usa el form de medicamentos (`dosis` guarda solo el
 * número; la unidad va aparte). Si la unidad no es una de las soportadas
 * (ej. "mcg"), devuelve el texto entero como valor y unidad null — mejor
 * conservar el dato que etiquetarlo con una unidad equivocada.
 */
// Cómo lo escribe la gente -> unidad de `UNIDADES_DOSIS` ("1 comprimido", "20 gotitas").
const SINONIMOS_UNIDAD: Record<string, (typeof UNIDADES_DOSIS)[number]> = {
  comprimido: "comp.",
  comprimidos: "comp.",
  pastilla: "comp.",
  pastillas: "comp.",
  gota: "gotas",
  gotita: "gotas",
  gotitas: "gotas",
  "µg": "mcg",
  ug: "mcg",
  microgramo: "mcg",
  microgramos: "mcg",
  miligramo: "mg",
  miligramos: "mg",
  mililitro: "ml",
  mililitros: "ml",
};

export function separarDosis(texto: string | null | undefined): { valor: string; unidad: string | null } {
  const t = (texto ?? "").trim();
  if (!t) return { valor: "", unidad: null };
  // "1/2 comprimido" -> 0.5. Solo una fracción propia de comprimido (o sin
  // unidad): "500/30 mg" o "10/20 mg" son combinaciones de dos drogas y quedan tal cual.
  const fraccion = t.match(/^(\d+)\s*\/\s*(\d+)(.*)$/);
  const restoFraccion = (fraccion?.[3] ?? "").trim().toLowerCase().replace(/\.$/, "");
  const propia =
    fraccion &&
    Number(fraccion[1]) < Number(fraccion[2]) &&
    ["", "comp", "comprimido", "comprimidos", "pastilla", "pastillas"].includes(restoFraccion);
  const normalizado = propia
    ? `${String(Math.round((Number(fraccion[1]) / Number(fraccion[2])) * 100) / 100)}${fraccion[3]}`
    : t;
  const m = normalizado.match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/);
  if (!m) return { valor: t, unidad: null };
  const numero = m[1].replace(",", ".");
  const unidadCruda = (m[2] ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!unidadCruda) return { valor: numero, unidad: null };
  const unidad =
    UNIDADES_DOSIS.find((u) => u.toLowerCase().replace(/\.$/, "") === unidadCruda) ?? SINONIMOS_UNIDAD[unidadCruda];
  return unidad ? { valor: numero, unidad } : { valor: t, unidad: null };
}
