import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";
import { momentoDelDia, normalizarHora } from "@/lib/rutina/momento";

/**
 * La toma más antigua que ya corresponde, agrupada solo por su hora exacta.
 * Ordena por hora normalizada ("8:00" antes que "09:00"). Una pendiente cuya
 * hora guardada es inválida no se puede ubicar en el día: se devuelve aparte
 * en `invalidas` (nunca como futura en `resto`) para que se la corrija.
 */
export function proximoGrupoPendiente(hoy: MedicamentoConToma[], ahoraHHMM: string) {
  const ahora = normalizarHora(ahoraHHMM);
  const conHora = hoy
    .filter((m) => !m.tomado)
    .map((m) => ({ m, hora: normalizarHora(m.hora_programada) }));
  const invalidas = conHora.filter((x) => x.hora === null).map((x) => x.m);
  const pendientes = conHora
    .filter((x): x is { m: MedicamentoConToma; hora: string } => x.hora !== null)
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .map((x) => x.m);
  const primera = pendientes.find((m) => ahora !== null && normalizarHora(m.hora_programada)! <= ahora) ?? null;
  const horaGrupo = primera ? normalizarHora(primera.hora_programada) : null;
  const momento = primera ? momentoDelDia(primera.hora_programada) : null;
  const enGrupo = primera ? pendientes.filter((m) => normalizarHora(m.hora_programada) === horaGrupo) : [];
  const idsGrupo = new Set(enGrupo.map((m) => m.id));
  const resto = pendientes.filter((m) => !idsGrupo.has(m.id));
  return { pendientes, primera, momento, enGrupo, resto, invalidas };
}

/**
 * Primer turno que todavía no pasó: de un día futuro, o de hoy con hora >= ahora.
 * Espera la lista ordenada por fecha y hora. Puro.
 */
export function elegirProximoTurno<T extends { fecha: string; hora: string }>(turnos: T[], hoyISO: string, ahoraHHMM: string): T | null {
  return turnos.find((t) => t.fecha > hoyISO || t.hora.slice(0, 5) >= ahoraHHMM) ?? null;
}
