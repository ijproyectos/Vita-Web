import { COMIDAS_SELECTOR, type ComidaSelector } from "@/lib/medicamentos/comidas";
import { HORA_POR_MOMENTO, type ConComida, type MomentoDia } from "@/lib/medicamentos/tipos";
import { separarDosis, UNIDADES_DOSIS } from "@/lib/inventario/tipos";

// Piezas puras del paso guiado de remedios del onboarding (una pregunta por
// vez). Las tablas de comidas y frecuencias NO se repiten acá: vienen de
// `lib/medicamentos/comidas.ts`, las mismas del formulario manual.

/** Una toma ya respondida: hora, relación con la comida y el texto con el que se eligió. */
export type TomaGuiada = { hora: string; conComida: ConComida; etiqueta: string | null };

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
  const { valor, unidad } = separarDosis(texto);
  if (!/^\d+(\.\d+)?$/.test(valor)) return { tipo: "ilegible" };
  return unidad ? { tipo: "completa", valor, unidad } : { tipo: "sin-unidad", numero: valor };
}

/** Comidas que se ofrecen para un momento del día (las del selector de hora del formulario). */
export function comidasDelMomento(momento: MomentoDia): ComidaSelector[] {
  return COMIDAS_SELECTOR.filter((c) => c.momento === momento);
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
  return [t.hora, t.etiqueta].filter(Boolean).join(" · ");
}
