import type { Medicamento } from "./tipos";
import { textoDosis } from "./tipos";

// Resolución PURA de "el medicamento al que se refiere este nombre" (única implementación:
// la usan buscarPorNombre del núcleo y las confirmaciones del chat).

function norm(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "08:00:00" y "8:00" dan "08:00"; si no parece una hora devuelve el texto tal cual. */
export function hhmm(hora: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : String(hora ?? "").trim();
}

export type ResolucionMedicamento =
  | { estado: "no_encontrado" }
  | { estado: "ambiguo"; filas: Medicamento[]; candidatos: { hora: string; dosis: string }[]; mismaHora: boolean }
  | { estado: "unico"; medicamento: Medicamento };

/**
 * A qué fila se refiere el modelo. Misma búsqueda que `buscarPorNombre` (la exacta
 * le gana a la parcial), pero SIN caer en silencio a la primera coincidencia: con
 * varias y sin una hora que acierte a una sola, es ambiguo y se le pregunta al
 * usuario. Un único candidato se acepta aunque la hora sugerida no coincida: la
 * confirmación muestra la hora real y el usuario puede cancelar.
 */
export function resolverMedicamento(todos: Medicamento[], nombre: string, horaHint?: string): ResolucionMedicamento {
  const buscado = norm(nombre);
  if (!buscado) return { estado: "no_encontrado" };
  const exactas = todos.filter((m) => norm(m.nombre) === buscado);
  const candidatos = exactas.length > 0 ? exactas : todos.filter((m) => norm(m.nombre).includes(buscado));
  if (candidatos.length === 0) return { estado: "no_encontrado" };
  if (candidatos.length === 1) return { estado: "unico", medicamento: candidatos[0] };

  const hint = horaHint ? hhmm(horaHint) : "";
  const porHora = hint ? candidatos.filter((m) => hhmm(m.hora_programada) === hint) : [];
  if (porHora.length === 1) return { estado: "unico", medicamento: porHora[0] };

  const horas = new Set(candidatos.map((m) => hhmm(m.hora_programada)));
  return {
    estado: "ambiguo",
    filas: candidatos,
    candidatos: candidatos.map((m) => ({ hora: hhmm(m.hora_programada), dosis: textoDosis(m) })),
    mismaHora: horas.size < candidatos.length,
  };
}

