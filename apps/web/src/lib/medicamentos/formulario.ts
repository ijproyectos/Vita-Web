import { normalizarHora } from "@/lib/rutina/momento";
import { conComidaDeIndicacion, esIndicacionComida, type ComidaToma } from "./comidas";
import type { ConComida } from "./tipos";

// Lectura de las tomas que manda el formulario de medicamento (alta propia y
// del cuidador): campos `tomaHora`, `tomaComida` y `tomaIndicacion` en tríos, en el mismo orden.
// Es el borde del sistema: se valida todo, no se confía en el cliente.

export const COMIDAS_VALIDAS: ConComida[] = ["antes", "con", "despues", "no-importa"];
export const MAX_TOMAS = 6;

/**
 * Comida de una toma que llega del cliente. La clave del catálogo manda: si es
 * válida, `con_comida` se deriva de ella; si no (o no vino), se respeta un
 * `con_comida` legacy válido y, si tampoco, "no-importa".
 */
export function normalizarComida(conComida: unknown, indicacion: unknown): ComidaToma {
  if (esIndicacionComida(indicacion)) return { conComida: conComidaDeIndicacion(indicacion), indicacion };
  return { conComida: COMIDAS_VALIDAS.includes(conComida as ConComida) ? (conComida as ConComida) : "no-importa", indicacion: null };
}

export function leerTomas(formData: FormData): ({ hora: string } & ComidaToma)[] {
  const horas = formData.getAll("tomaHora").map(String);
  const comidas = formData.getAll("tomaComida").map(String);
  const indicaciones = formData.getAll("tomaIndicacion").map(String);
  const vistas = new Set<string>();
  const tomas: ({ hora: string } & ComidaToma)[] = [];
  for (let i = 0; i < horas.length && tomas.length < MAX_TOMAS; i++) {
    const hora = normalizarHora(horas[i]);
    if (!hora || vistas.has(hora)) continue;
    vistas.add(hora);
    tomas.push({ hora, ...normalizarComida(comidas[i], indicaciones[i]) });
  }
  return tomas;
}
