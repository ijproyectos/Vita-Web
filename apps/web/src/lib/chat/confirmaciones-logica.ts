import type { DatosActualizarHorario, DiaSemana, Medicamento } from "@/lib/medicamentos/tipos";
import { textoDosis } from "@/lib/medicamentos/tipos";

// Lógica PURA (sin DB) de las confirmaciones de borrar/cambiar un horario:
// resolver a qué fila se refiere el modelo, comparar con lo que se mostró al
// usuario, armar los textos y decidir qué hacer con cada mensaje entrante. La
// parte con I/O está en confirmaciones.ts.

/** Tools destructivas: nunca ejecutan directo; guardan la acción y esperan el Confirmar. */
export const TOOLS_CON_CONFIRMACION_GUARDADA: ReadonlySet<string> = new Set(["delete_schedule", "update_schedule"]);

/** Cuánto vale una acción pendiente. */
export const VENTANA_ACCION_PENDIENTE_MS = 10 * 60 * 1000;

function norm(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
  | { estado: "ambiguo"; candidatos: { hora: string; dosis: string }[]; mismaHora: boolean }
  | { estado: "unico"; medicamento: Medicamento };

/**
 * A qué fila se refiere el modelo. Misma búsqueda que buscarPorNombre (exacta
 * le gana a parcial), pero SIN caer en silencio a la primera coincidencia: con
 * varias y sin una hora que acierte a una sola, es ambiguo y se le pregunta
 * al usuario. Un único candidato se acepta aunque la hora sugerida no coincida:
 * la confirmación muestra la hora real y el usuario puede cancelar.
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
    candidatos: candidatos.map((m) => ({ hora: hhmm(m.hora_programada), dosis: textoDosis(m) })),
    mismaHora: horas.size < candidatos.length,
  };
}

export type SnapshotMedicamento = {
  id: string;
  nombre: string;
  dosis: string;
  hora_programada: string;
  dias_recurrentes: DiaSemana[];
};

export function tomarSnapshot(m: Medicamento): SnapshotMedicamento {
  return {
    id: m.id,
    nombre: m.nombre,
    dosis: textoDosis(m),
    hora_programada: m.hora_programada,
    dias_recurrentes: m.dias_recurrentes ?? [],
  };
}

/** true solo si la fila actual es la MISMA que se le mostró al usuario (id, nombre, dosis, hora y días). */
export function snapshotCoincide(snapshot: unknown, actual: Medicamento): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as Partial<SnapshotMedicamento>;
  if (s.id !== actual.id || s.nombre !== actual.nombre) return false;
  if ((s.dosis ?? "") !== textoDosis(actual)) return false;
  if (hhmm(s.hora_programada) !== hhmm(actual.hora_programada)) return false;
  const antes = [...(s.dias_recurrentes ?? [])].sort().join(",");
  const ahora = [...(actual.dias_recurrentes ?? [])].sort().join(",");
  return antes === ahora;
}

/** Lo que se ejecuta al confirmar, siempre por id (nunca por nombre). */
export type AccionGuardada = {
  tool: "delete_schedule" | "update_schedule";
  destinoId: string;
  medicamentoId: string;
  /** Nombre de la persona si el destino no es quien chatea (para el texto y la tarjeta). */
  persona: string | null;
  cambios?: DatosActualizarHorario;
};

export function esAccionGuardada(valor: unknown): valor is AccionGuardada {
  if (!valor || typeof valor !== "object") return false;
  const a = valor as Partial<AccionGuardada>;
  return (
    (a.tool === "delete_schedule" || a.tool === "update_schedule") &&
    typeof a.destinoId === "string" &&
    typeof a.medicamentoId === "string"
  );
}

/** true si la acción pendiente todavía vale. Sin fecha o con fecha inválida = vencida. */
export function pendienteVigente(venceAt: string | null | undefined, ahora: number): boolean {
  const t = venceAt ? new Date(venceAt).getTime() : NaN;
  return Number.isFinite(t) && t > ahora;
}

function descripcion(m: Pick<Medicamento, "nombre" | "dosis" | "unidad">): string {
  const dosis = textoDosis(m);
  return dosis ? `${m.nombre} ${dosis}` : m.nombre;
}

const DE_PERSONA = (persona: string | null) => (persona ? ` de ${persona}` : "");

/** La pregunta que ve el usuario. */
export function textoPropuesta(accion: AccionGuardada, m: Medicamento): string {
  const hora = hhmm(m.hora_programada);
  if (accion.tool === "delete_schedule") {
    return `¿Borro ${descripcion(m)} de las ${hora}${DE_PERSONA(accion.persona)}? También se borra su historial de tomas.`;
  }
  const c = accion.cambios ?? {};
  const partes: string[] = [];
  if (c.horaProgramada) partes.push(`la hora a las ${hhmm(c.horaProgramada)}`);
  else if (c.momentoDia) partes.push(`el momento del día a ${c.momentoDia}`);
  if (c.diasRecurrentes) {
    partes.push(c.diasRecurrentes.length > 0 ? `los días a ${c.diasRecurrentes.join(", ")}` : "los días a todos los días");
  }
  return `¿Cambio ${descripcion(m)} de las ${hora}${DE_PERSONA(accion.persona)}: ${partes.join(" y ")}?`;
}

/** Texto de éxito, armado con lo que se mostró (el snapshot), no con lo que haya quedado después. */
export function textoExito(accion: AccionGuardada, snapshot: SnapshotMedicamento): string {
  const que = snapshot.dosis ? `${snapshot.nombre} ${snapshot.dosis}` : snapshot.nombre;
  const hora = hhmm(snapshot.hora_programada);
  const c = accion.cambios ?? {};
  if (accion.tool === "delete_schedule") return `Listo, borré ${que} de las ${hora}${DE_PERSONA(accion.persona)}.`;
  const nueva = c.horaProgramada ? ` Ahora es a las ${hhmm(c.horaProgramada)}.` : "";
  return `Listo, cambié ${que} de las ${hora}${DE_PERSONA(accion.persona)}.${nueva}`;
}

export type TurnoConfirmacion = "confirmar_id" | "cancelar_id" | "si_tipeado" | "no_tipeado" | "otro";

// El mensaje ENTERO tiene que ser la respuesta: "si me olvido de..." o "no, mejor
// cambiá la hora" son mensajes nuevos, no un sí/no.
const SOLO_SI = /^(si|sip|dale|ok|okey|okay|confirmo|confirmar|confirmado|claro|de una|correcto|borralo|borrala|hacelo|cambialo|si dale|si confirmo|si borralo|si cambialo|si hacelo|si por favor|si gracias|dale gracias)$/;
const SOLO_NO = /^(no|nop|nunca|nada|cancelar|cancelo|cancela|cancelalo|mejor no|no gracias|no borres|no lo borres|no lo cambies)$/;

function limpio(texto: string): string {
  return norm(texto).replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Qué es el mensaje entrante respecto de una acción pendiente. Los ids del
 * cuerpo (botones) mandan; un sí/no tipeado solo cuenta si es el mensaje
 * completo. Todo lo demás es "otro": limpia la pendiente y sigue al modelo.
 */
export function clasificarTurno(entrada: { confirmarId?: unknown; cancelarId?: unknown; mensaje: string }): TurnoConfirmacion {
  if (typeof entrada.confirmarId === "string" && entrada.confirmarId) return "confirmar_id";
  if (typeof entrada.cancelarId === "string" && entrada.cancelarId) return "cancelar_id";
  const t = limpio(entrada.mensaje);
  if (SOLO_SI.test(t)) return "si_tipeado";
  if (SOLO_NO.test(t)) return "no_tipeado";
  return "otro";
}
