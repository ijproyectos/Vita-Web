// Parte PURA del aviso "Voy a ir acompañado" de un turno (decisión del dueño 2026-10-30): cuándo se
// avisa a los cuidadores y a quiénes. Sin `server-only` ni I/O a propósito (la importan los tests).

export type EstadoTurnoAcompanado = { acompanado: boolean; fecha: string; hora: string };

/** La DB puede devolver "10:30:00"; se compara siempre "HH:MM". */
function horaHHMM(hora: string): string {
  return hora.slice(0, 5);
}

/**
 * ¿Hay que avisar a los cuidadores? Solo si el turno queda con acompañante y es nuevo para ellos:
 * alta con la marca, marca que pasa de apagada a prendida, o cambio de día/hora de un turno ya acompañado.
 */
export function debeAvisarAcompanado(previo: EstadoTurnoAcompanado | null, nuevo: EstadoTurnoAcompanado): boolean {
  if (!nuevo.acompanado) return false;
  if (!previo || !previo.acompanado) return true;
  return previo.fecha !== nuevo.fecha || horaHHMM(previo.hora) !== horaHHMM(nuevo.hora);
}

export type VinculoCrudo = { cuidador_id: string | null; estado: string };

/**
 * Cuidadores a avisar: vínculos ACEPTADOS con cuenta, sin repetidos, sin quien hizo la acción (un cuidador que
 * carga el turno desde el perfil familiar no se avisa a sí mismo) y sin el propio dueño del turno.
 */
export function destinatariosAcompanado(vinculos: VinculoCrudo[], actorId: string | null, duenioId: string): string[] {
  const ids = new Set<string>();
  for (const v of vinculos) {
    if (v.estado !== "aceptado" || !v.cuidador_id) continue;
    if (v.cuidador_id === actorId || v.cuidador_id === duenioId) continue;
    ids.add(v.cuidador_id);
  }
  return [...ids];
}

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "2026-11-06" + "10:30" -> "viernes 6 de noviembre, 10:30" (calendario puro, sin zona horaria). */
export function fechaHoraTurnoTexto(fechaISO: string, hora: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO);
  const h = horaHHMM(hora).replace(/^0(\d:)/, "$1");
  if (!m) return `${fechaISO}, ${h}`;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS_LARGOS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_LARGOS[d.getUTCMonth()]}, ${h}`;
}
