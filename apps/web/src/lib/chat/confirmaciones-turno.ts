import type { DatosActualizarTurno, Turno } from "@/lib/turnos/tipos";
import { fechaTurnoEnPalabras } from "@/lib/turnos/formato";

// Lógica PURA de las confirmaciones de cambiar / borrar un turno desde el chat
// (mismo mecanismo que borrar o cambiar un horario de medicamento, ver
// confirmaciones-logica.ts): qué se le muestra a la persona, con qué se compara
// al confirmar y qué cambios pidió el modelo, validados antes de guardar la
// pendiente (lo que se guarda es exactamente lo que se ejecuta).

export type ToolTurno = "update_appointment" | "delete_appointment";

export type SnapshotTurno = { id: string; especialidad: string; fecha: string; hora: string };

const hhmm = (h: string) => h.slice(0, 5);

export function tomarSnapshotTurno(t: Turno): SnapshotTurno {
  return { id: t.id, especialidad: t.especialidad, fecha: t.fecha, hora: hhmm(t.hora) };
}

/** true solo si el turno actual es el MISMO que se le mostró (id, especialidad, día y hora). */
export function snapshotTurnoCoincide(snapshot: unknown, actual: Turno): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as Partial<SnapshotTurno>;
  return s.id === actual.id && s.especialidad === actual.especialidad && s.fecha === actual.fecha && s.hora === hhmm(actual.hora);
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

/** true si ese día y hora ya pasaron (hora de Argentina): un turno no puede quedar en el pasado. */
export function turnoQuedaEnElPasado(fecha: string, hora: string, hoy: string, horaAhora: string): boolean {
  return fecha < hoy || (fecha === hoy && hhmm(hora) < hhmm(horaAhora));
}

export const ERROR_TURNO_PASADO = "Ese día y hora ya pasaron: un turno no puede quedar en el pasado. Confirmá la fecha con la persona.";

/**
 * Cambios que pidió el modelo (inglés) a los del núcleo. `hoy` y `horaAhora` en
 * hora de Argentina; `actual` = el turno de hoy, para validar una hora sola.
 */
export function cambiosTurnoDeInput(
  input: Record<string, unknown>,
  hoy: string,
  horaAhora = "00:00",
  actual?: Pick<Turno, "fecha" | "hora">
): { datos: DatosActualizarTurno } | { error: string } {
  const datos: DatosActualizarTurno = {};
  if (input.date !== undefined && input.date !== null && input.date !== "") {
    const fecha = String(input.date).trim();
    if (!FECHA.test(fecha)) return { error: `date inválido: "${fecha}" (formato YYYY-MM-DD).` };
    if (fecha < hoy) return { error: ERROR_TURNO_PASADO };
    datos.fecha = fecha;
  }
  if (input.time !== undefined && input.time !== null && input.time !== "") {
    const hora = String(input.time).trim();
    if (!HORA.test(hora)) return { error: `time inválido: "${hora}" (formato HH:MM).` };
    datos.hora = hora;
  }
  const profesional = texto(input.professional, 80);
  if (profesional !== undefined) datos.profesional = profesional || null;
  const lugar = texto(input.place, 200);
  if (lugar !== undefined) datos.lugar = lugar || null;
  const notas = texto(input.notes, 300);
  if (notas !== undefined) datos.notas = notas || null;
  if (typeof input.with_company === "boolean") datos.acompanado = input.with_company;
  if ((datos.fecha || datos.hora) && actual && turnoQuedaEnElPasado(datos.fecha ?? actual.fecha, datos.hora ?? actual.hora, hoy, horaAhora)) {
    return { error: ERROR_TURNO_PASADO };
  }
  if (Object.keys(datos).length === 0) {
    return { error: "No indicaste qué cambiar del turno (date, time, professional, place, notes o with_company)." };
  }
  return { datos };
}

const DE_PERSONA = (persona: string | null) => (persona ? ` de ${persona}` : "");
const cuando = (fecha: string, hora: string) => `del ${fechaTurnoEnPalabras(fecha)} a las ${hhmm(hora)}`;

/** La pregunta que ve la persona. */
export function textoPropuestaTurno(tool: ToolTurno, persona: string | null, t: Turno, cambios?: DatosActualizarTurno): string {
  const que = `el turno de ${t.especialidad} ${cuando(t.fecha, t.hora)}${DE_PERSONA(persona)}`;
  if (tool === "delete_appointment") return `¿Borro ${que}? Dejan de llegar sus avisos.`;
  const c = cambios ?? {};
  const partes: string[] = [];
  if (c.fecha && c.hora) partes.push(`pasarlo al ${fechaTurnoEnPalabras(c.fecha)} a las ${c.hora}`);
  else if (c.fecha) partes.push(`pasarlo al ${fechaTurnoEnPalabras(c.fecha)}`);
  else if (c.hora) partes.push(`pasarlo a las ${c.hora}`);
  if (c.profesional !== undefined) partes.push(c.profesional ? `el profesional a ${c.profesional}` : "quitar el profesional");
  if (c.lugar !== undefined) partes.push(c.lugar ? `el lugar a ${c.lugar}` : "quitar el lugar");
  if (c.notas !== undefined) partes.push(c.notas ? `la indicación a "${c.notas}"` : "quitar la indicación");
  if (c.acompanado !== undefined) partes.push(c.acompanado ? "marcar que va acompañado" : "marcar que va sin compañía");
  return `¿Cambio ${que}: ${partes.join(" y ")}?`;
}

/** Texto de éxito, armado con lo que se mostró (el snapshot). */
export function textoExitoTurno(tool: ToolTurno, persona: string | null, s: SnapshotTurno, cambios?: DatosActualizarTurno): string {
  const que = `el turno de ${s.especialidad} ${cuando(s.fecha, s.hora)}${DE_PERSONA(persona)}`;
  if (tool === "delete_appointment") return `Listo, borré ${que}.`;
  const nuevo = cambios?.fecha || cambios?.hora ? ` Ahora es el ${fechaTurnoEnPalabras(cambios.fecha ?? s.fecha)} a las ${cambios.hora ?? s.hora}.` : "";
  return `Listo, cambié ${que}.${nuevo}`;
}
