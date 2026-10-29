// Respuestas habladas de los chips del modo simple. PURO: sin I/O ni IA, recibe
// los datos ya cargados. Voseo rioplatense, 1-2 frases cortas, horas en palabras, sin listas.
import { diasEntre, horaEnPalabras } from "./formato";

export type MedHoy = { nombre: string; hora_programada: string; tomado: boolean };

export type TurnoProximo = {
  /** "YYYY-MM-DD" */
  fecha: string;
  /** "HH:MM" */
  hora: string;
  especialidad: string;
  profesional: string | null;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const HHMM = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** "08:00:00" / "8:00" -> "08:00"; null si no es una hora real. */
function normalizarHora(valor: string | null | undefined): string | null {
  const m = HHMM.exec((valor ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

/** "A las 10 de la mañana" -> "de las 10 de la mañana" (para "pastillas de ..."). */
function deLaHora(hhmm: string): string {
  return horaEnPalabras(hhmm).replace(/^A /, "de ");
}

/** ["A"] -> "A"; ["A","B"] -> "A y B"; ["A","B","C"] -> "A, B y C". */
export function unirNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

type Grupo = { hora: string | null; nombres: string[]; filas: number; tomadas: number; pendientes: number };

/** Los nombres del grupo, o una palabra neutra por cantidad de filas si ninguna tiene nombre. */
function nombresODefault(g: Grupo): string {
  if (g.nombres.length > 0) return unirNombres(g.nombres);
  return g.filas === 1 ? "una pastilla" : `${g.filas} pastillas`;
}

/** Agrupa por hora (orden cronológico; las de hora ilegible van al final). */
function agruparPorHora(meds: MedHoy[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const m of meds) {
    const hora = normalizarHora(m.hora_programada);
    const clave = hora ?? "?";
    const g = mapa.get(clave) ?? { hora, nombres: [], filas: 0, tomadas: 0, pendientes: 0 };
    const nombre = m.nombre.trim();
    if (nombre && !g.nombres.includes(nombre)) g.nombres.push(nombre);
    g.filas++;
    if (m.tomado) g.tomadas++;
    else g.pendientes++;
    mapa.set(clave, g);
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.hora === null) return b.hora === null ? 0 : 1;
    if (b.hora === null) return -1;
    return aMinutos(a.hora) - aMinutos(b.hora);
  });
}

/** "¿Ya tomé la pastilla?" */
export function respuestaYaTome(meds: MedHoy[], ahoraHHMM: string): string {
  if (meds.length === 0) return "Hoy no tenés pastillas cargadas.";
  const ahora = normalizarHora(ahoraHHMM);
  const ahoraMin = ahora ? aMinutos(ahora) : null;

  const pendientes = meds.filter((m) => !m.tomado);
  if (pendientes.length === 0) return "Sí. Ya tomaste todas las pastillas de hoy. Muy bien.";

  // Pendientes que ya les tocaba (o de hora ilegible, que no podemos dar por futuras).
  const vencidas = pendientes.filter((m) => {
    const h = normalizarHora(m.hora_programada);
    return h === null || ahoraMin === null || aMinutos(h) <= ahoraMin;
  });

  if (vencidas.length > 0) {
    const partes = agruparPorHora(vencidas).map((g) => {
      const nombres = nombresODefault(g);
      return g.hora ? `${nombres} ${deLaHora(g.hora)}` : nombres;
    });
    return `Todavía no tomaste ${unirNombres(partes)}.`;
  }

  // Lo pendiente es todo futuro.
  const proxima = agruparPorHora(pendientes)[0];
  const cuando = proxima.hora ? minuscula(horaEnPalabras(proxima.hora)) : null;
  const tomadas = meds.filter((m) => m.tomado).map((m) => m.nombre.trim()).filter(Boolean);
  const sufijo = cuando ? ` La próxima es ${cuando}.` : "";
  if (tomadas.length === 0) return `Todavía no te toca ninguna.${sufijo}`;
  return `Sí, ya tomaste ${unirNombres([...new Set(tomadas)])}.${sufijo}`;
}

/** "¿Qué pastillas me tocan hoy?" */
export function respuestaQueMeToca(meds: MedHoy[]): string {
  if (meds.length === 0) return "Hoy no tenés pastillas cargadas.";
  const frases = agruparPorHora(meds).map((g) => {
    const cabecera = g.hora ? horaEnPalabras(g.hora) : "Sin horario";
    // "Ya la tomaste" solo si no queda NINGUNA fila pendiente a esa hora (contar
    // filas, no nombres: puede haber filas repetidas o sin nombre).
    const todas = g.pendientes === 0 && g.tomadas > 0;
    const sufijo = todas ? ` ${(g.nombres.length > 0 ? g.nombres.length === 1 : g.filas === 1) ? "Esa ya la tomaste." : "Esas ya las tomaste."}` : "";
    return `${cabecera}, ${nombresODefault(g)}.${sufijo}`;
  });
  return frases.join(" ");
}

function fechaEnPalabras(fechaISO: string, hoyISO: string): string | null {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  if (isNaN(Date.parse(`${hoyISO}T00:00:00Z`))) return null;
  const dif = diasEntre(hoyISO, fechaISO);
  if (dif === 0) return "hoy";
  if (dif === 1) return "mañana";
  return `el ${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** "¿Cuándo es mi próximo turno?" `hoyISO` = hoy en hora AR. */
export function respuestaProximoTurno(turno: TurnoProximo | null, hoyISO: string): string {
  if (!turno) return "No tenés turnos cargados.";
  const cuando = fechaEnPalabras(turno.fecha, hoyISO);
  if (!cuando) return "Tenés un turno cargado, pero no pude leer la fecha. Mirá la sección de turnos.";
  const hora = normalizarHora(turno.hora);
  const especialidad = turno.especialidad.trim();
  const horaTxt = hora ? `, ${minuscula(horaEnPalabras(hora))}` : "";
  const con = especialidad ? `, con ${especialidad}` : "";
  return `Tu próximo turno es ${cuando}${horaTxt}${con}.`;
}
