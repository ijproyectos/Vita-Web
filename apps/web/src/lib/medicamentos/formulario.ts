import { normalizarHora } from "@/lib/rutina/momento";
import { conComidaDeIndicacion, esIndicacionComida, type ComidaToma } from "./comidas";
import { ErrorEntradaMedicamento } from "./duplicados";
import { fechaValida } from "./cuando";
import { CANTIDAD_MAXIMA, esForma, type FormaMedicamento } from "./forma";
import { DIAS_SEMANA, type ConComida, type DiaSemana } from "./tipos";

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

export function leerTomas(formData: FormData): ({ hora: string; cantidad?: number } & ComidaToma)[] {
  const horas = formData.getAll("tomaHora").map(String);
  const comidas = formData.getAll("tomaComida").map(String);
  const indicaciones = formData.getAll("tomaIndicacion").map(String);
  const cantidades = formData.getAll("tomaCantidad").map(String);
  return normalizarTomas(horas.map((hora, i) => ({ hora, conComida: comidas[i], indicacion: indicaciones[i] }))).map((t, i) =>
    cantidades[i] ? { ...t, cantidad: Number(cantidades[i]) } : t
  );
}

/** Campos "¿Cuándo lo toma?" y forma, sin validar: los valida el núcleo. */
export function leerPlanMedicamento(formData: FormData): { forma: string; diasRecurrentes: string[]; fechaFin: string | null } {
  return {
    forma: String(formData.get("forma") ?? "pastilla"),
    diasRecurrentes: formData.getAll("dia").map(String),
    fechaFin: String(formData.get("fechaFin") ?? "") || null,
  };
}

export function normalizarForma(valor: unknown): FormaMedicamento {
  if (valor === undefined || valor === null) return "pastilla";
  if (!esForma(valor)) throw new ErrorEntradaMedicamento("Revisá la forma del medicamento.");
  return valor;
}

/** Días válidos sin repetir; los 7 equivalen a "todos" (lista vacía). */
export function normalizarDias(dias: unknown): DiaSemana[] {
  if (dias === undefined || dias === null) return [];
  if (!Array.isArray(dias) || dias.some((d) => !DIAS_SEMANA.includes(d as DiaSemana))) {
    throw new ErrorEntradaMedicamento("Revisá los días elegidos.");
  }
  const unicos = [...new Set(dias as DiaSemana[])];
  return unicos.length === DIAS_SEMANA.length ? [] : unicos;
}

/**
 * Fecha de fin válida o null. Una fecha pasada solo se acepta si ya era la
 * guardada (editar un tratamiento terminado sin tocar su fecha).
 */
export function normalizarFechaFin(valor: unknown, hoy: string, actual?: string | null): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const fecha = fechaValida(valor);
  if (!fecha) throw new ErrorEntradaMedicamento("Revisá la fecha de fin.");
  if (fecha < hoy && fecha !== actual?.slice(0, 10)) throw new ErrorEntradaMedicamento("La fecha de fin ya pasó.");
  return fecha;
}

/** Cantidad de una toma, o null si no vino. Los pasos los controla la pantalla. */
export function normalizarCantidad(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > CANTIDAD_MAXIMA) throw new ErrorEntradaMedicamento("Revisá la cantidad de cada toma.");
  return Math.round(n * 100) / 100;
}
