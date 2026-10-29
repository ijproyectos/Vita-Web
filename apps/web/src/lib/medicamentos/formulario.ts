import { normalizarHora } from "@/lib/rutina/momento";
import { conComidaDeIndicacion, esIndicacionComida, type ComidaToma } from "./comidas";
import { ErrorEntradaMedicamento } from "./duplicados";
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

/**
 * Validates a raw list of takes (hour + meal): normalizes the hour and REJECTS
 * (throws `ErrorEntradaMedicamento`, message fit for the user) an invalid or
 * repeated hour or more than MAX_TOMAS takes. Nothing is dropped silently, so
 * what the user sees on the form is exactly what gets saved.
 */
export function normalizarTomas(crudas: { hora: unknown; conComida?: unknown; indicacion?: unknown }[]): ({ hora: string } & ComidaToma)[] {
  if (crudas.length > MAX_TOMAS) throw new ErrorEntradaMedicamento(`Podés cargar hasta ${MAX_TOMAS} horarios por medicamento.`);
  const vistas = new Set<string>();
  const tomas: ({ hora: string } & ComidaToma)[] = [];
  for (const t of crudas) {
    const hora = normalizarHora(String(t?.hora));
    if (!hora) throw new ErrorEntradaMedicamento("Revisá los horarios: hay uno que no es válido.");
    if (vistas.has(hora)) throw new ErrorEntradaMedicamento("Hay horarios repetidos. Dejá cada horario una sola vez.");
    vistas.add(hora);
    tomas.push({ hora, ...normalizarComida(t.conComida, t.indicacion) });
  }
  return tomas;
}

export function leerTomas(formData: FormData): ({ hora: string } & ComidaToma)[] {
  const horas = formData.getAll("tomaHora").map(String);
  const comidas = formData.getAll("tomaComida").map(String);
  const indicaciones = formData.getAll("tomaIndicacion").map(String);
  return normalizarTomas(horas.map((hora, i) => ({ hora, conComida: comidas[i], indicacion: indicaciones[i] })));
}
