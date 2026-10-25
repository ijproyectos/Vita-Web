import { normalizarHora } from "@/lib/rutina/momento";
import type { ConComida } from "./tipos";

// Lectura de las tomas que manda el formulario de medicamento (alta propia y
// del cuidador): campos `tomaHora` y `tomaComida` en pares, en el mismo orden.
// Es el borde del sistema: se valida todo, no se confía en el cliente.

export const COMIDAS_VALIDAS: ConComida[] = ["antes", "con", "despues", "no-importa"];
export const MAX_TOMAS = 6;

export function leerTomas(formData: FormData): { hora: string; conComida: ConComida }[] {
  const horas = formData.getAll("tomaHora").map(String);
  const comidas = formData.getAll("tomaComida").map(String);
  const vistas = new Set<string>();
  const tomas: { hora: string; conComida: ConComida }[] = [];
  for (let i = 0; i < horas.length && tomas.length < MAX_TOMAS; i++) {
    const hora = normalizarHora(horas[i]);
    if (!hora || vistas.has(hora)) continue;
    vistas.add(hora);
    const c = comidas[i] as ConComida;
    tomas.push({ hora, conComida: COMIDAS_VALIDAS.includes(c) ? c : "no-importa" });
  }
  return tomas;
}
