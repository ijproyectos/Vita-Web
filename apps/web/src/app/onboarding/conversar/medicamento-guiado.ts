import { opcionDeIndicacion, type ComidaToma } from "@/lib/medicamentos/comidas";
import { moverHora } from "@/lib/rutina/momento";
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

// --- Elegir remedio y horas --------------------------------------------------

export const REMEDIOS_RAPIDOS = ["Metformina", "Losartán", "Levotiroxina"] as const;

export const MAX_HORAS_MED = 4;

/** Hora que propone "Agregar otro horario": 12 h después de la primera, o 6 después de la última, sin repetir. */
export function siguienteHoraMed(horas: string[]): string {
  let hora = moverHora(horas[horas.length - 1], horas.length === 1 ? 720 : 360);
  while (horas.includes(hora)) hora = moverHora(hora, 30);
  return hora;
}

/** "08:00", "08:00 y 20:00", "08:00, 14:00 y 21:00" */
export function textoHoras(horas: string[]): string {
  if (horas.length < 2) return horas[0] ?? "";
  return `${horas.slice(0, -1).join(", ")} y ${horas[horas.length - 1]}`;
}

export function textoVeces(n: number): string {
  return n === 1 ? "1 vez por día" : `${n} veces por día`;
}

/** Texto descriptivo de `frecuencia`: las tomas reales son las horas elegidas. */
export function frecuenciaDeHoras(horas: string[]): string {
  return `${horas.length}x día`;
}

/** La comida se completa después, en la ficha del medicamento. */
export function tomasDesdeHoras(horas: string[]): TomaGuiada[] {
  return horas.map((hora) => ({ hora, conComida: "no-importa", indicacion: null }));
}

/** "Losartán 50 mg" */
export function tituloMed(b: Pick<BorradorMed, "nombre" | "dosis" | "unidad">): string {
  return [b.nombre, b.dosis ? `${b.dosis} ${b.unidad}` : null].filter(Boolean).join(" ");
}

/** "08:00 · Con el desayuno" (sin indicación si no importa). */
export function lineaDeToma(t: TomaGuiada): string {
  return [t.hora, opcionDeIndicacion(t.indicacion)?.etiqueta].filter(Boolean).join(" · ");
}

// --- Resumen final de la charla --------------------------------------------

/** Cuántos remedios se ven antes de "Ver N más". */
export const REMEDIOS_RESUMEN_VISIBLES = 4;

/** De ["08:00 · Con el desayuno", "20:00"] a "08:00 · 20:00": en el resumen va solo la hora. */
export function horasDeRemedio(tomas: string[]): string {
  return tomas.map((t) => t.split(" · ")[0]).join(" · ");
}

/** Los primeros, salvo que esté abierto o sobre uno solo: "Ver 1 más" no ahorra nada. */
export function remediosVisibles<T>(meds: T[], abierto: boolean): { visibles: T[]; ocultos: number } {
  if (abierto || meds.length <= REMEDIOS_RESUMEN_VISIBLES + 1) return { visibles: meds, ocultos: 0 };
  return { visibles: meds.slice(0, REMEDIOS_RESUMEN_VISIBLES), ocultos: meds.length - REMEDIOS_RESUMEN_VISIBLES };
}
