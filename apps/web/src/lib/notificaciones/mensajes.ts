// Textos de las notificaciones push. Tono de la marca: primero la calma,
// después la acción; voseo rioplatense; nunca alarmante.
import type { PayloadPush } from "./push";

/** "09:00" -> "9:00" (así se dice en voz alta y se lee más natural). */
export function horaCorta(hhmm: string): string {
  return hhmm.replace(/^0(\d:)/, "$1");
}

/** Push al cuidador: el elder todavía no confirmó una dosis. */
export function payloadDosisVencida(d: {
  elderId: string;
  elderNombre: string;
  medicamentoId: string;
  nombre: string;
  horaProgramada: string;
  fechaAR: string;
}): PayloadPush {
  return {
    title: "vita",
    body: `${d.elderNombre} todavía no tomó su ${d.nombre} de las ${horaCorta(d.horaProgramada)}`,
    url: `/cuidar/${d.elderId}`,
    tag: `dosis-vencida-${d.medicamentoId}-${d.fechaAR}`,
  };
}

/** Push al elder: un cuidador le recuerda una dosis pendiente. */
export function payloadRecordatorio(d: {
  medicamentoId: string;
  nombre: string;
  horaProgramada: string;
  fechaAR: string;
}): PayloadPush {
  return {
    title: "vita",
    body: `Tu familiar te recuerda tomar ${d.nombre} de las ${horaCorta(d.horaProgramada)}`,
    url: "/app/modo-simple",
    tag: `recordatorio-${d.medicamentoId}-${d.fechaAR}`,
  };
}
