import { indicacionesDelMomento, opcionDeIndicacion, type ComidaToma, type OpcionComida } from "@/lib/medicamentos/comidas";
import { HORA_POR_MOMENTO, type MomentoDia } from "@/lib/medicamentos/tipos";
import { separarDosis, UNIDADES_DOSIS } from "@/lib/inventario/tipos";

// Piezas puras del paso guiado de remedios del onboarding (una pregunta por
// vez). El catálogo de comidas y las frecuencias NO se repiten acá: vienen de
// `lib/medicamentos/comidas.ts`, las mismas del formulario manual.

/** Una toma ya respondida: hora + comida elegida (clave del catálogo y su con_comida). */
export type TomaGuiada = { hora: string } & ComidaToma;

export type BorradorMed = {
  nombre: string;
  /** Solo el número (como guarda el formulario manual); null = "No sé". */
  dosis: string | null;
  unidad: string;
  frecuencia: string;
  tomas: TomaGuiada[];
};

export const BORRADOR_VACIO: BorradorMed = { nombre: "", dosis: null, unidad: "mg", frecuencia: "", tomas: [] };

/** Chip de unidad -> valor de `UNIDADES_DOSIS` ("comprimidos" se guarda como "comp."). */
export const UNIDAD_POR_CHIP: Record<string, (typeof UNIDADES_DOSIS)[number]> = {
  "Sí, mg": "mg",
  mcg: "mcg",
  ml: "ml",
  gotas: "gotas",
  UI: "UI",
  comprimidos: "comp.",
};
export const CHIPS_UNIDAD = Object.keys(UNIDAD_POR_CHIP);

export type LecturaDosis =
  | { tipo: "completa"; valor: string; unidad: string }
  | { tipo: "sin-unidad"; numero: string }
  | { tipo: "ilegible" };

/** Lee lo que escribió quien responde "¿De cuánto es?": "50 mg", "50" o algo que no es una dosis. */
export function leerDosis(texto: string): LecturaDosis {
  // Combinación de dos drogas ("500/30 mg", "10/20 mg"): se guarda tal cual.
  const combinacion = texto.trim().match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)+)\s*(mg|mcg|ml)$/i);
  if (combinacion) return { tipo: "completa", valor: combinacion[1].replace(/\s+/g, ""), unidad: combinacion[2].toLowerCase() };
  const { valor, unidad } = separarDosis(texto);
  if (!/^\d+(\.\d+)?$/.test(valor)) return { tipo: "ilegible" };
  return unidad ? { tipo: "completa", valor, unidad } : { tipo: "sin-unidad", numero: valor };
}

/** Opciones de comida que se ofrecen para un momento del día (las del catálogo, como en el selector de hora). */
export function comidasDelMomento(momento: MomentoDia): OpcionComida[] {
  return indicacionesDelMomento(momento);
}

/** Hora sugerida de "No importa" para un momento: la misma que usa el alta por momento. */
export function horaSugeridaSinComida(momento: MomentoDia): string {
  return HORA_POR_MOMENTO[momento];
}

const ORDINALES = ["1.ª", "2.ª", "3.ª", "4.ª", "5.ª", "6.ª"];

/** "1.ª toma" si hay varias; null si es una sola. */
export function etiquetaDeToma(indice: number, total: number): string | null {
  return total > 1 ? `${ORDINALES[indice] ?? `${indice + 1}.ª`} toma` : null;
}

/** "Losartán 50 mg" */
export function tituloMed(b: Pick<BorradorMed, "nombre" | "dosis" | "unidad">): string {
  return [b.nombre, b.dosis ? `${b.dosis} ${b.unidad}` : null].filter(Boolean).join(" ");
}

/** "08:00 · Con el desayuno" (sin indicación si no importa). */
export function lineaDeToma(t: TomaGuiada): string {
  return [t.hora, opcionDeIndicacion(t.indicacion)?.etiqueta].filter(Boolean).join(" · ");
}
