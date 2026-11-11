// Fechas, horas y ventana de medianoche de las dosis, en hora de Argentina.
// PURO (sin base de datos ni `server-only`): separado de nucleo.ts, que lo
// re-exporta con los mismos nombres, así ningún import de la app cambió.
import type { DiaSemana, Medicamento } from "./tipos";
import { vigenteEnFecha } from "./cuando";
import { fechaEnAR } from "@/lib/tiempo-ar";

const DIAS_POR_INDICE: DiaSemana[] = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

/**
 * Día de la semana (en español, minúsculas) de una fecha dada, en el
 * calendario de Argentina — exportada porque el detector de dosis
 * vencidas necesita el día correspondiente a un `ahora` explícito, igual
 * criterio que `fechaEnAR`.
 *
 * OJO: NO se puede usar `fecha.getDay()` directo — depende del huso
 * horario del proceso (Netlify/Node corren en UTC), así que entre las
 * 21:00 y 23:59 hora AR (00:00-02:59 UTC del día siguiente) devolvería el
 * día de mañana, no el de hoy en Argentina — exactamente la misma clase
 * de desfase UTC/AR que `horaEnAR` documenta para la hora, pero en el día
 * de la semana. Se reconstruye
 * la fecha a partir de sus componentes Y/M/D ya en huso AR (vía
 * `Intl.DateTimeFormat`) antes de pedir `getDay()`, para que el resultado
 * no dependa del huso del proceso.
 */
export function diaSemanaDe(fecha: Date): DiaSemana {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const fechaAR = new Date(Number(obj.year), Number(obj.month) - 1, Number(obj.day));
  return DIAS_POR_INDICE[fechaAR.getDay()];
}

/**
 * Hora de pared argentina ("HH:MM") de un instante dado. `hora_programada`
 * siempre representa una hora AR, sin importar en qué huso horario corre
 * el proceso (Netlify/Node corren en UTC) — `new Date()` captura el
 * instante real, y esto lo reconstruye a la hora de pared que un usuario
 * en Argentina vería en ese momento. Usada por `esDosisVencida` (detector
 * de dosis vencidas) y por el badge "atrasada" de modo simple.
 */
export function horaEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha);
}

/**
 * Predicado puro: ¿una dosis programada a `horaProgramada` ("HH:MM", hora
 * AR) está vencida a `ahoraHHMM` ("HH:MM", ya convertida a hora AR — ver
 * `horaEnAR`), dado un margen de gracia en minutos? No conoce fechas ni
 * confirmaciones — quien llama resuelve eso (ver `detectarDosisVencidas`,
 * lib/notificaciones/nucleo.ts).
 */
export function esDosisVencida(
  horaProgramada: string,
  ahoraHHMM: string,
  minutosGracia: number
): boolean {
  const aMinutos = (hhmm: string): number => {
    const [horas, minutos] = hhmm.split(":").map(Number);
    return horas * 60 + minutos;
  };

  return aMinutos(ahoraHHMM) - aMinutos(horaProgramada) >= minutosGracia;
}

/**
 * Fin de la ventana de medianoche (hora AR): hasta las 00:30 las dosis de
 * AYER que nadie tomó siguen contando como vencidas (decisión del usuario).
 * Pasada esa hora dejan de contar — y de alertar.
 */
export const FIN_VENTANA_MEDIANOCHE = "00:30";

/**
 * Predicado puro: ¿una dosis de AYER ("HH:MM", hora AR) sigue vencida a
 * `ahoraHHMM` (hora AR de hoy)? Solo dentro de la ventana 00:00-00:29 AR y
 * con el mismo margen de gracia, contado cruzando la medianoche (23:50 a las
 * 00:10 son 20 minutos). Fuera de la ventana siempre `false`, así que una
 * dosis futura de HOY nunca se confunde con una vencida (un "+24 h"
 * genérico en `esDosisVencida` lo haría). Igual que `esDosisVencida`, quien
 * llama resuelve días aplicables y confirmaciones (ver
 * `filtrarDosisDeAyerVencidas`).
 */
export function esDosisDeAyerVencida(
  horaProgramada: string,
  ahoraHHMM: string,
  minutosGracia: number
): boolean {
  if (ahoraHHMM >= FIN_VENTANA_MEDIANOCHE) return false;
  const aMinutos = (hhmm: string): number => {
    const [horas, minutos] = hhmm.split(":").map(Number);
    return horas * 60 + minutos;
  };
  return aMinutos(ahoraHHMM) + 24 * 60 - aMinutos(horaProgramada) >= minutosGracia;
}

/** Fecha AR "YYYY-MM-DD" del día anterior al de `fecha` (AR no tiene horario de verano: 24 h exactas). */
export function fechaAyerEnAR(fecha: Date = new Date()): string {
  return fechaEnAR(new Date(fecha.getTime() - 24 * 60 * 60 * 1000));
}

/** ¿El medicamento aplica el día de la semana (AR) de `dia`? Sin días = todos. */
export function aplicaEnDia(medicamento: Pick<Medicamento, "dias_recurrentes">, dia: DiaSemana): boolean {
  return medicamento.dias_recurrentes.length === 0 || medicamento.dias_recurrentes.includes(dia);
}

/**
 * Dosis de AYER aún vencidas en la ventana de medianoche: las que aplicaban
 * el día de la semana de ayer (AR), no figuran en `tomadas` (ids de
 * medicamento con `tomado=true`) y superan la gracia cruzando las 00:00.
 * Pura; `[]` fuera de la ventana. Quien arma `tomadas` debe mirar
 * `medicamentos_tomas.fecha = ayerAR` (o hoy AR si ya se marcó pasada la
 * medianoche sin indicar la fecha de la dosis): `marcarTomado` graba la fecha
 * AR de la dosis.
 */
export function filtrarDosisDeAyerVencidas<T extends Pick<Medicamento, "hora_programada" | "dias_recurrentes" | "fecha_fin"> & { id: string }>(
  meds: T[],
  tomadas: Set<string>,
  ahora: Date,
  minutosGracia: number
): T[] {
  const horaAhora = horaEnAR(ahora);
  if (horaAhora >= FIN_VENTANA_MEDIANOCHE) return [];
  const diaAyer = diaSemanaDe(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
  const fechaAyer = fechaAyerEnAR(ahora);
  return meds.filter(
    (m) =>
      aplicaEnDia(m, diaAyer) &&
      vigenteEnFecha(m, fechaAyer) &&
      !tomadas.has(m.id) &&
      esDosisDeAyerVencida(m.hora_programada, horaAhora, minutosGracia)
  );
}

/**
 * Fecha AR con la que se graba (o se busca) la toma marcada en `ahora`. Sin
 * `fechaDosis` es el día AR de hoy. `fechaDosis` ("YYYY-MM-DD") permite marcar
 * una dosis de AYER (tarjeta "Era ayer", /cuidar) pero solo dentro de la
 * ventana 00:00-00:29 AR y solo si es exactamente ayer AR: cualquier otro
 * valor (inválido, futuro, más viejo, ayer fuera de ventana) cae a hoy — el
 * cliente nunca decide una fecha arbitraria.
 */
export function fechaDeTomaEnAR(ahora: Date, fechaDosis?: string): string {
  const hoy = fechaEnAR(ahora);
  if (
    fechaDosis &&
    fechaDosis === fechaAyerEnAR(ahora) &&
    horaEnAR(ahora) < FIN_VENTANA_MEDIANOCHE
  ) {
    return fechaDosis;
  }
  return hoy;
}

/**
 * Los últimos `dias` días AR (de hoy hacia atrás) con su fecha "YYYY-MM-DD" y
 * día de la semana: las claves de `calcularAdherencia`, sin depender del huso
 * del proceso.
 */
export function diasDeAdherencia(ahora: Date, dias: number): { fecha: string; dia: DiaSemana }[] {
  return Array.from({ length: dias }, (_, i) => {
    const instante = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000); // AR sin horario de verano
    return { fecha: fechaEnAR(instante), dia: diaSemanaDe(instante) };
  });
}
