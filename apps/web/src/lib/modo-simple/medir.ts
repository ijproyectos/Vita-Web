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
        tipo,
        frase: fraseMedir(p),
        hora: t.hora,
        unidad: META_MEDICION[tipo as TipoMedicion].unidad,
        valor: t.medicion ? formatearValor(t.medicion) : null,
      }));
    })
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.frase.localeCompare(b.frase));
}

/**
 * La que toca ahora, como la tarjeta de una pastilla: la más reciente cuya hora
 * ya llegó y todavía no se anotó. null = nada pendiente.
 */
export function medirQueToca(items: MedirHoy[], ahoraHHMM: string): MedirHoy | null {
  const vencidas = items.filter((i) => i.valor === null && i.hora <= ahoraHHMM);
  return vencidas.length > 0 ? vencidas[vencidas.length - 1] : null;
}

/**
 * Turno para la tarjeta del modo simple: el de hoy solo hasta su hora (después
 * desaparece "Hoy tenés turno"); si no, el de mañana. `turnos` en orden de fecha y hora.
 */
export function turnoHoyOManana<T extends { fecha: string; hora: string }>(turnos: T[], hoy: string, manana: string, ahoraHHMM: string): T | null {
  return turnos.find((t) => (t.fecha === hoy && t.hora.slice(0, 5) >= ahoraHHMM) || t.fecha === manana) ?? null;
}
