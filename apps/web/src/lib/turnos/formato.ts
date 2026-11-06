// Formato de turnos para tarjetas de resumen (puro, sin zona horaria: la fecha
// es un día de calendario "YYYY-MM-DD", no un instante).

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-11-12" -> "jueves 12 de noviembre". Con `anioActual` distinto del año del turno agrega " de 2027". */
export function fechaTurnoEnPalabras(fechaISO: string, anioActual?: number): string {
  const m = fechaISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fechaISO;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return fechaISO;
  const base = `${DIAS[d.getUTCDay()]} ${dia} de ${MESES[mes - 1]}`;
  return anioActual !== undefined && anio !== anioActual ? `${base} de ${anio}` : base;
}

/** "09:00" -> "9:00 h" (con espacio sin corte: la "h" nunca queda sola en otra línea). */
export function horaTurnoTexto(hora: string): string {
  const m = hora.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${Number(m[1])}:${m[2]}\u00a0h` : hora;
}

export type TurnoParaTarjeta = { especialidad: string; profesional?: string | null; fecha: string; hora: string; lugar?: string | null };

/** Las líneas de una fila de turno, ya en palabras: título, día, hora y dónde (si hay). */
export function lineasDeTurno(t: TurnoParaTarjeta, anioActual?: number): { titulo: string; dia: string; hora: string; donde: string | null } {
  const titulo = [t.especialidad.trim(), t.profesional?.trim()].filter(Boolean).join(" · ");
  return {
    titulo,
    dia: fechaTurnoEnPalabras(t.fecha, anioActual),
    hora: horaTurnoTexto(t.hora),
    donde: t.lugar?.trim() || null,
  };
}
