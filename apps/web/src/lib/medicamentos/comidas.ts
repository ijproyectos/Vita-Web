import { momentoDelDia, ETIQUETA_MOMENTO } from "@/lib/rutina/momento";
import { indicacionDeComida, type ConComida, type MomentoDia } from "./tipos";

// Piezas del selector de hora (V7 D:3343): momentos del día con su hora por
// defecto y la lista de "Con las comidas" (el diseño la llama `meals`). Lo que
// se persiste es solo la categoría (`con_comida`: antes/con/después): la hora
// ya queda en `hora_programada`.

export const MOMENTOS_SELECTOR: { momento: MomentoDia; etiqueta: string; hora: string }[] = [
  { momento: "mañana", etiqueta: ETIQUETA_MOMENTO["mañana"], hora: "08:00" },
  { momento: "mediodia", etiqueta: ETIQUETA_MOMENTO.mediodia, hora: "12:00" },
  { momento: "tarde", etiqueta: ETIQUETA_MOMENTO.tarde, hora: "17:00" },
  { momento: "noche", etiqueta: ETIQUETA_MOMENTO.noche, hora: "21:00" },
];

export type ComidaSelector = { etiqueta: string; hora: string; momento: MomentoDia; conComida: ConComida };

export const COMIDAS_SELECTOR: ComidaSelector[] = [
  { etiqueta: "En ayunas", hora: "07:00", momento: "mañana", conComida: "antes" },
  { etiqueta: "Antes del desayuno", hora: "07:30", momento: "mañana", conComida: "antes" },
  { etiqueta: "Con el desayuno", hora: "08:00", momento: "mañana", conComida: "con" },
  { etiqueta: "Después del desayuno", hora: "08:30", momento: "mañana", conComida: "despues" },
  { etiqueta: "Antes del almuerzo", hora: "12:30", momento: "mediodia", conComida: "antes" },
  { etiqueta: "Con el almuerzo", hora: "13:00", momento: "mediodia", conComida: "con" },
  { etiqueta: "Después del almuerzo", hora: "13:30", momento: "mediodia", conComida: "despues" },
  { etiqueta: "Antes de la merienda", hora: "17:00", momento: "tarde", conComida: "antes" },
  { etiqueta: "Con la merienda", hora: "17:30", momento: "tarde", conComida: "con" },
  { etiqueta: "Después de la merienda", hora: "18:00", momento: "tarde", conComida: "despues" },
  { etiqueta: "Antes de la cena", hora: "20:00", momento: "noche", conComida: "antes" },
  { etiqueta: "Con la cena", hora: "20:30", momento: "noche", conComida: "con" },
  { etiqueta: "Después de la cena", hora: "21:30", momento: "noche", conComida: "despues" },
  { etiqueta: "Antes de dormir", hora: "23:00", momento: "noche", conComida: "antes" },
];

/** Una toma del formulario de medicamento: hora "HH:MM" + relación con la comida. */
export type TomaForm = { id?: string; hora: string; conComida: ConComida };

/** "Con el desayuno" para esa toma, o null si no tiene indicación de comida. */
export function relacionDeToma(t: Pick<TomaForm, "hora" | "conComida">): string | null {
  return indicacionDeComida({ con_comida: t.conComida, momento_dia: momentoDelDia(t.hora || "08:00") });
}

export const FRECUENCIAS_MEDICAMENTO = ["1x día", "2x día", "3x día", "c/8 hs", "Única vez"] as const;
export type FrecuenciaMedicamento = (typeof FRECUENCIAS_MEDICAMENTO)[number];

/** Cantidad de tomas por día de cada frecuencia (D:4791 `freqCount`). */
export function cantidadDeTomas(frecuencia: string): number {
  return { "1x día": 1, "2x día": 2, "3x día": 3, "c/8 hs": 3, "Única vez": 1 }[frecuencia as FrecuenciaMedicamento] ?? 1;
}

export const HORAS_POR_DEFECTO = ["08:00", "14:00", "22:00"];

/** Ajusta la lista de tomas a la cantidad que pide la frecuencia, conservando las ya elegidas. */
export function ajustarTomas(tomas: TomaForm[], cantidad: number): TomaForm[] {
  const siguiente = tomas.slice(0, cantidad);
  const usadas = new Set(siguiente.map((t) => t.hora));
  for (const h of [...HORAS_POR_DEFECTO, "11:00", "18:00", "06:00", "20:00"]) {
    if (siguiente.length >= cantidad) break;
    if (!usadas.has(h)) {
      siguiente.push({ hora: h, conComida: "no-importa" });
      usadas.add(h);
    }
  }
  return siguiente;
}

/** "Vita te recuerda a las 08:00 y 22:00 cada día." (D:5083) */
export function textoRecordatorio(horas: string[], frecuencia: string): string {
  if (horas.length === 0) return "Elegí un horario para que vita te recuerde.";
  const lista = horas.length <= 1 ? horas.join("") : `${horas.slice(0, -1).join(", ")} y ${horas[horas.length - 1]}`;
  return `Vita te recuerda a las ${lista}${frecuencia === "Única vez" ? " una sola vez." : " cada día."}`;
}
