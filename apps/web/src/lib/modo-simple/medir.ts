// Mediciones del modo simple, PURO. El recordatorio "Es hora de medirte…" sale
// del plan de monitoreo (horarios y días, migración 053), con la misma regla que
// Rutina y el aviso "Hora de medir" (`planAplica` + `tramosDeHoy`): nunca se
// inventa un horario. Solo los tipos que se ofrecen en un plan (`TIPOS_PLAN`).
import { esDeLaMetrica, fraseMedir, planAplica, tramosDeHoy, type Monitoreo } from "@/lib/mediciones/plan";
import { formatearValor, META_MEDICION, TIPOS_PLAN, type Medicion, type TipoMedicion } from "@/lib/mediciones/tipos";
import type { DiaSemana } from "@/lib/medicamentos/tipos";

/** Los tipos que el teclado grande del modo simple sabe cargar. */
export type TipoMedirSimple = "presion" | "glucemia" | "peso" | "temperatura";

export function esTipoMedirSimple(v: unknown): v is TipoMedirSimple {
  return v === "presion" || v === "glucemia" || v === "peso" || v === "temperatura";
}

export type MedirHoy = {
  clave: string;
  /** Plan de monitoreo (para posponer en el servidor). */
  monitoreoId: string;
  tipo: TipoMedirSimple;
  /** "la presión", "la glucemia"… */
  frase: string;
  /** "HH:MM" del plan. */
  hora: string;
  unidad: string;
  /** Lo que se anotó para ese horario ("135/85"), o null si falta. */
  valor: string | null;
};

/** Un renglón por horario de cada plan que toca hoy, en orden de hora. */
export function medirDelDia(planes: Monitoreo[], medicionesHoy: Medicion[], dia: DiaSemana, hoy: string): MedirHoy[] {
  return planes
    .filter((p) => (TIPOS_PLAN as readonly string[]).includes(p.tipo) && esTipoMedirSimple(p.tipo) && planAplica(p, dia, hoy))
    .flatMap((p) => {
      const tipo = p.tipo as TipoMedirSimple;
      return tramosDeHoy(p.horarios, medicionesHoy.filter((m) => esDeLaMetrica(m, p))).map((t) => ({
        clave: `${p.id}-${t.hora}`,
        monitoreoId: p.id,
        tipo,
        frase: fraseMedir(p),
        hora: t.hora,
        unidad: META_MEDICION[tipo as TipoMedicion].unidad,
        valor: t.medicion ? formatearValor(t.medicion) : null,
      }));
    })
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.frase.localeCompare(b.frase));
}

/** Cuánto se ve "Es hora de medirte…" desde su hora; después queda como no anotada. */
export const VENTANA_MEDIR_MIN = 120;

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * La que toca ahora, como la tarjeta de una pastilla: la más reciente cuya hora
 * ya llegó hace menos de 2 h y todavía no se anotó. null = nada pendiente.
 */
export function medirQueToca(items: MedirHoy[], ahoraHHMM: string): MedirHoy | null {
  const ahora = aMinutos(ahoraHHMM);
  const vencidas = items.filter((i) => {
    if (i.valor !== null) return false;
    const desde = ahora - aMinutos(i.hora);
    return desde >= 0 && desde < VENTANA_MEDIR_MIN;
  });
  return vencidas.length > 0 ? vencidas[vencidas.length - 1] : null;
}

/** Desde qué hora del día anterior se muestra el turno de mañana (como el aviso del día antes). */
export const TURNO_MANANA_DESDE = "20:00";

/**
 * Turno para el modo simple: el de hoy solo hasta su hora (después desaparece);
 * el de mañana recién desde las 20 h. `turnos` en orden de fecha y hora.
 */
export function turnoHoyOManana<T extends { fecha: string; hora: string }>(turnos: T[], hoy: string, manana: string, ahoraHHMM: string): T | null {
  return (
    turnos.find(
      (t) => (t.fecha === hoy && t.hora.slice(0, 5) >= ahoraHHMM) || (t.fecha === manana && ahoraHHMM >= TURNO_MANANA_DESDE)
    ) ?? null
  );
}
