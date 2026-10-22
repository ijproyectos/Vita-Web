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

// --- Avisos programados (V7 "Lista de Avisos") ---------------------------------

const ACCION_TOMADA = { action: "tomada", title: "Ya la tomé" };
const ACCION_POSPONER = { action: "posponer", title: "En 15 min" };

const TEXTO_COMIDA: Record<string, string> = {
  antes: "antes de comer",
  con: "con la comida",
  despues: "después de comer",
};

type DosisAviso = {
  medicamentoId: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  conComida: string | null;
  notas: string | null;
  horaProgramada: string;
  fechaAR: string;
};

// Mismo tag para el aviso a la hora, el segundo aviso y el "te aviso de nuevo"
// de una misma dosis: se reemplazan, no se apilan.
function tagDosis(d: { medicamentoId: string; fechaAR: string }): string {
  return `dosis-${d.medicamentoId}-${d.fechaAR}`;
}

/**
 * Push al que toma la pastilla, a la hora. Los botones "Ya la tomé" / "En 15
 * min" los resuelve sw.js contra /api/avisos/accion. La alarma a pantalla
 * completa del diseño NO existe en una PWA: `requireInteraction` + vibración
 * (sw.js) es lo más parecido que permite el navegador.
 */
export function payloadDosisHora(d: DosisAviso): PayloadPush {
  const detalle = [
    d.dosis ? `${d.dosis} ${d.unidad}` : null,
    d.conComida ? TEXTO_COMIDA[d.conComida] ?? null : null,
    d.notas?.trim() || null,
  ].filter(Boolean);
  return {
    title: `Es hora de tu ${d.nombre}`,
    body: detalle.length > 0 ? detalle.join(" · ") : `Programada para las ${horaCorta(d.horaProgramada)}`,
    url: "/app/modo-simple",
    tag: tagDosis(d),
    actions: [ACCION_TOMADA, ACCION_POSPONER],
    requireInteraction: true,
    renotify: true,
    datos: { medicamentoId: d.medicamentoId },
  };
}

/** Segundo aviso (tono ámbar): ~30 min después, si sigue sin confirmarse. */
export function payloadDosisSegundoAviso(d: DosisAviso): PayloadPush {
  return {
    title: `Todavía no tomaste tu ${d.nombre}`,
    body: `Era a las ${horaCorta(d.horaProgramada)}. Cuando puedas, confirmala.`,
    url: "/app/modo-simple",
    tag: tagDosis(d),
    actions: [ACCION_TOMADA],
    requireInteraction: true,
    renotify: true,
    datos: { medicamentoId: d.medicamentoId, tono: "ambar" },
  };
}

/** "Te aviso de nuevo": vence una posposición y la dosis sigue pendiente. */
export function payloadDosisPospuesta(d: DosisAviso): PayloadPush {
  return {
    title: `Te aviso de nuevo: ${d.nombre}`,
    body: `La habías pospuesto. Era a las ${horaCorta(d.horaProgramada)}.`,
    url: "/app/modo-simple",
    tag: tagDosis(d),
    actions: [ACCION_TOMADA, ACCION_POSPONER],
    requireInteraction: true,
    renotify: true,
    datos: { medicamentoId: d.medicamentoId },
  };
}

/** Al cuidador: el elder confirmó después de la alerta. Mismo tag = reemplaza la alerta. */
export function payloadDosisResuelta(d: {
  elderNombre: string;
  elderId: string;
  medicamentoId: string;
  nombre: string;
  fechaAR: string;
}): PayloadPush {
  return {
    title: "vita",
    body: `${d.elderNombre} ya tomó su ${d.nombre}`,
    url: `/cuidar/${d.elderId}`,
    // Es el tag de payloadDosisVencida: reemplaza la alerta en vez de sumar.
    tag: `dosis-vencida-${d.medicamentoId}-${d.fechaAR}`,
  };
}

type TurnoAviso = {
  turnoId: string;
  especialidad: string;
  profesional: string | null;
  lugar: string | null;
  hora: string;
};

function urlMapas(lugar: string | null): Record<string, string> {
  return lugar ? { mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}` } : {};
}

/** El día anterior (20:00): "Mañana tenés Kinesiología". */
export function payloadTurnoDiaAntes(t: TurnoAviso): PayloadPush {
  const detalle = [horaCorta(t.hora), t.profesional?.trim() || null].filter(Boolean).join(" · ");
  return {
    title: `Mañana tenés ${t.especialidad}`,
    body: detalle,
    url: "/app/rutina",
    tag: `turno-dia-antes-${t.turnoId}`,
    actions: t.lugar ? [{ action: "como-llegar", title: "Cómo llegar" }] : undefined,
    datos: urlMapas(t.lugar),
  };
}

/** 2 horas antes: "En 2 horas tenés Kinesiología", con la dirección. */
export function payloadTurno2h(t: TurnoAviso): PayloadPush {
  return {
    title: `En 2 horas tenés ${t.especialidad}`,
    body: t.lugar?.trim() || `A las ${horaCorta(t.hora)}`,
    url: "/app/rutina",
    tag: `turno-2h-${t.turnoId}`,
    actions: t.lugar ? [{ action: "como-llegar", title: "Cómo llegar" }] : undefined,
    datos: urlMapas(t.lugar),
  };
}

/** Stock por debajo del umbral (una vez por día por medicamento). */
export function payloadStockBajo(s: { inventarioId: string; nombre: string; stock: number; fechaAR: string }): PayloadPush {
  const titulo =
    s.stock <= 0
      ? `Se terminó tu ${s.nombre}`
      : s.stock === 1
        ? `Te queda 1 pastilla de ${s.nombre}`
        : `Te quedan ${s.stock} pastillas de ${s.nombre}`;
  return {
    title: titulo,
    body: "Para que lo pidas a tiempo.",
    url: "/app/pastillas",
    tag: `stock-${s.inventarioId}-${s.fechaAR}`,
  };
}

// --- Avisos de familia (V7 paquete 8): al CUIDADOR, sobre una persona cuidada ----

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || "Tu familiar";
}

/** 21:00: "Elsa tomó 4 de 5 hoy". Con pendientes, el cuerpo dice cuáles. */
export function payloadResumenDia(d: {
  personaId: string;
  personaNombre: string;
  tomadas: number;
  total: number;
  pendientes: { nombre: string; hora: string }[];
  fechaAR: string;
}): PayloadPush {
  const nombre = primerNombre(d.personaNombre);
  const falta = d.pendientes.slice(0, 2).map((p) => `${p.nombre} (${horaCorta(p.hora)})`);
  const resto = d.pendientes.length - falta.length;
  const cuerpo =
    d.pendientes.length === 0
      ? "Completó todas sus tomas de hoy."
      : `Quedó sin tomar: ${falta.join(", ")}${resto > 0 ? ` y ${resto} más` : ""}.`;
  return {
    title: `${nombre} tomó ${d.tomadas} de ${d.total} hoy`,
    body: cuerpo,
    url: `/app/familia/${d.personaId}`,
    tag: `resumen-dia-${d.personaId}-${d.fechaAR}`,
  };
}

/** El día anterior (20:00): "Mañana Elsa tiene Kinesiología". */
export function payloadTurnoPersonaDiaAntes(t: {
  personaId: string;
  personaNombre: string;
  turnoId: string;
  especialidad: string;
  profesional: string | null;
  hora: string;
}): PayloadPush {
  const detalle = [horaCorta(t.hora), t.profesional?.trim() || null].filter(Boolean).join(" · ");
  return {
    title: `Mañana ${primerNombre(t.personaNombre)} tiene ${t.especialidad}`,
    body: detalle,
    url: `/app/familia/${t.personaId}`,
    tag: `turno-persona-${t.turnoId}`,
  };
}

/** Stock por debajo del umbral de la persona (a cuidadores Admin, una vez por día). */
export function payloadStockPersona(s: {
  personaId: string;
  personaNombre: string;
  inventarioId: string;
  nombre: string;
  stock: number;
  fechaAR: string;
}): PayloadPush {
  const quien = primerNombre(s.personaNombre);
  const titulo =
    s.stock <= 0
      ? `A ${quien} se le terminó el ${s.nombre}`
      : s.stock === 1
        ? `A ${quien} le queda 1 pastilla de ${s.nombre}`
        : `A ${quien} le quedan ${s.stock} pastillas de ${s.nombre}`;
  return {
    title: titulo,
    body: "Para que lo pida a tiempo.",
    url: `/app/familia/${s.personaId}`,
    tag: `stock-persona-${s.inventarioId}-${s.fechaAR}`,
  };
}

/** "Elsa ya está en vita": entró por primera vez con el código de acceso. */
export function payloadPersonaEnVita(d: { personaId: string; personaNombre: string }): PayloadPush {
  return {
    title: `${primerNombre(d.personaNombre)} ya está en vita`,
    body: "Entró con el código · usa el modo simple.",
    url: `/app/familia/${d.personaId}`,
    tag: `persona-en-vita-${d.personaId}`,
  };
}
