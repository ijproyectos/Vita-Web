import { momentoDelDia, ETIQUETA_MOMENTO } from "@/lib/rutina/momento";
import type { ConComida, Medicamento, MomentoDia } from "./tipos";

// Piezas del selector de hora (V7 D:3343): momentos del día con su hora por
// defecto y el catálogo de indicaciones de comida (el diseño lo llama `meals`).
// Se persiste la clave elegida (`indicacion`) y su `con_comida` derivado; la
// hora queda en `hora_programada` y es la que manda.

export const MOMENTOS_SELECTOR: { momento: MomentoDia; etiqueta: string; hora: string }[] = [
  { momento: "mañana", etiqueta: ETIQUETA_MOMENTO["mañana"], hora: "08:00" },
  { momento: "mediodia", etiqueta: ETIQUETA_MOMENTO.mediodia, hora: "12:00" },
  { momento: "tarde", etiqueta: ETIQUETA_MOMENTO.tarde, hora: "17:00" },
  { momento: "noche", etiqueta: ETIQUETA_MOMENTO.noche, hora: "21:00" },
];

/** Claves de la indicación de comida: lo único que se guarda en `medicamentos.indicacion`. */
export type IndicacionComida =
  | "ayunas"
  | "antes-desayuno"
  | "con-desayuno"
  | "despues-desayuno"
  | "antes-almuerzo"
  | "con-almuerzo"
  | "despues-almuerzo"
  | "antes-merienda"
  | "con-merienda"
  | "despues-merienda"
  | "antes-cena"
  | "con-cena"
  | "despues-cena"
  | "antes-dormir";

/**
 * Una opción del catálogo. `hora` es solo la sugerencia aproximada al elegirla
 * (la hora real manda y se puede cambiar); `momento` agrupa los chips;
 * `conComida` es el valor legacy (`con_comida`) que se deriva al guardar.
 */
export type OpcionComida = { clave: IndicacionComida; etiqueta: string; hora: string; momento: MomentoDia; conComida: ConComida };

// Catálogo único de indicaciones de comida: el selector de hora, el onboarding,
// el parseo de formularios y el chat con vita eligen SIEMPRE de acá. Es una
// observación: nunca se deduce de la hora ni se resetea cuando la hora cambia.
export const INDICACIONES_COMIDA: OpcionComida[] = [
  { clave: "ayunas", etiqueta: "En ayunas", hora: "07:30", momento: "mañana", conComida: "antes" },
  { clave: "antes-desayuno", etiqueta: "Antes del desayuno", hora: "07:45", momento: "mañana", conComida: "antes" },
  { clave: "con-desayuno", etiqueta: "Con el desayuno", hora: "08:00", momento: "mañana", conComida: "con" },
  { clave: "despues-desayuno", etiqueta: "Después del desayuno", hora: "08:30", momento: "mañana", conComida: "despues" },
  { clave: "antes-almuerzo", etiqueta: "Antes del almuerzo", hora: "12:30", momento: "mediodia", conComida: "antes" },
  { clave: "con-almuerzo", etiqueta: "Con el almuerzo", hora: "13:00", momento: "mediodia", conComida: "con" },
  { clave: "despues-almuerzo", etiqueta: "Después del almuerzo", hora: "13:30", momento: "mediodia", conComida: "despues" },
  { clave: "antes-merienda", etiqueta: "Antes de la merienda", hora: "17:00", momento: "tarde", conComida: "antes" },
  { clave: "con-merienda", etiqueta: "Con la merienda", hora: "17:30", momento: "tarde", conComida: "con" },
  { clave: "despues-merienda", etiqueta: "Después de la merienda", hora: "18:00", momento: "tarde", conComida: "despues" },
  { clave: "antes-cena", etiqueta: "Antes de la cena", hora: "20:30", momento: "noche", conComida: "antes" },
  { clave: "con-cena", etiqueta: "Con la cena", hora: "21:00", momento: "noche", conComida: "con" },
  { clave: "despues-cena", etiqueta: "Después de la cena", hora: "21:30", momento: "noche", conComida: "despues" },
  { clave: "antes-dormir", etiqueta: "Antes de dormir", hora: "22:00", momento: "noche", conComida: "antes" },
];

export const CLAVES_INDICACION: IndicacionComida[] = INDICACIONES_COMIDA.map((o) => o.clave);

export function esIndicacionComida(valor: unknown): valor is IndicacionComida {
  return typeof valor === "string" && (CLAVES_INDICACION as string[]).includes(valor);
}

/** La opción del catálogo para una clave, o undefined si no existe. */
export function opcionDeIndicacion(clave: string | null | undefined): OpcionComida | undefined {
  return INDICACIONES_COMIDA.find((o) => o.clave === clave);
}

/** Opciones de un momento del día (para agrupar los chips). */
export function indicacionesDelMomento(momento: MomentoDia): OpcionComida[] {
  return INDICACIONES_COMIDA.filter((o) => o.momento === momento);
}

/** Valor legacy de `con_comida` que acompaña a una indicación ("no-importa" si no hay). */
export function conComidaDeIndicacion(clave: IndicacionComida | null | undefined): ConComida {
  return opcionDeIndicacion(clave)?.conComida ?? "no-importa";
}

/** Lo que se guarda de la comida en una toma: la clave elegida + su `con_comida` derivado. */
export type ComidaToma = { conComida: ConComida; indicacion: IndicacionComida | null };

/** Una toma del formulario de medicamento: hora "HH:MM" + comida (ver `ComidaToma`). */
export type TomaForm = { id?: string } & { hora: string } & ComidaToma;

const COMIDA_POR_MOMENTO: Record<MomentoDia, { con: string; antes: string; despues: string }> = {
  "mañana": { con: "Con el desayuno", antes: "Antes del desayuno", despues: "Después del desayuno" },
  mediodia: { con: "Con el almuerzo", antes: "Antes del almuerzo", despues: "Después del almuerzo" },
  tarde: { con: "Con la merienda", antes: "Antes de la merienda", despues: "Después de la merienda" },
  noche: { con: "Con la cena", antes: "Antes de la cena", despues: "Después de la cena" },
};

/**
 * Línea de "Indicación" ("Con el desayuno"); null si no hay. Muestra la clave
 * guardada tal cual (nunca la re-deduce de la hora). Solo las filas viejas, sin
 * clave, caen a la lectura legacy por `con_comida` + momento del día.
 */
export function indicacionDeComida(
  m: Pick<Medicamento, "con_comida" | "momento_dia"> & { indicacion?: IndicacionComida | null }
): string | null {
  const guardada = opcionDeIndicacion(m.indicacion);
  if (guardada) return guardada.etiqueta;
  if (m.con_comida === "no-importa") return null;
  return COMIDA_POR_MOMENTO[m.momento_dia]?.[m.con_comida] ?? null;
}

/**
 * "Con el desayuno" para esa toma, o null si no tiene indicación. Si no hay
 * clave guardada (fila vieja) cae a la lectura legacy por `con_comida` + momento.
 */
export function relacionDeToma(t: Pick<TomaForm, "hora" | "conComida" | "indicacion">): string | null {
  return indicacionDeComida({ indicacion: t.indicacion, con_comida: t.conComida, momento_dia: momentoDelDia(t.hora || "08:00") });
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
  for (const h of [...HORAS_POR_DEFECTO, "11:00", "18:00", "07:00", "20:00"]) {
    if (siguiente.length >= cantidad) break;
    if (!usadas.has(h)) {
      siguiente.push({ hora: h, conComida: "no-importa", indicacion: null });
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
