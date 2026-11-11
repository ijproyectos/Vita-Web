// Textos de las notificaciones push. Tono de la marca: primero la calma,
// después la acción; voseo rioplatense; nunca alarmante.
import type { PayloadPush } from "./push";
import { fechaHoraTurnoTexto } from "./turno-acompanado-logica";
import { textoLlevarAviso } from "@/lib/turnos/tipos";
import { cantidadStock, seCuentaConFoto } from "@/lib/medicamentos/forma";

/**
 * Destino de un aviso sobre otra persona. La ficha (`/app/familia/<id>`) es de
 * gestion del Admin: un Lector (rol "ver") no puede abrirla desde la vista de
 * solo mirar (la guia lo devuelve a /app sin explicar nada), asi que a el se lo
 * lleva a /app. Con el rol desconocido se mantiene la ficha.
 */
export function urlFichaPersona(personaId: string, rolDestino?: "editar" | "ver" | null): string {
  return rolDestino === "ver" ? "/app" : `/app/familia/${personaId}`;
}

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
    datos: { medicamentoId: d.medicamentoId, fecha: d.fechaAR },
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
    datos: { medicamentoId: d.medicamentoId, fecha: d.fechaAR, tono: "ambar" },
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
    datos: { medicamentoId: d.medicamentoId, fecha: d.fechaAR },
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
  llevar?: unknown;
};

/** Agrega "Llevá: …" al cuerpo del aviso del día anterior, si hay algo para llevar. */
function conLlevar(cuerpo: string, llevar: unknown): string {
  return [cuerpo, textoLlevarAviso(llevar)].filter(Boolean).join(" · ");
}

function urlMapas(lugar: string | null): Record<string, string> {
  return lugar ? { mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}` } : {};
}

/** El día anterior (20:00): "Mañana tenés Kinesiología". */
export function payloadTurnoDiaAntes(t: TurnoAviso): PayloadPush {
  const detalle = [horaCorta(t.hora), t.profesional?.trim() || null].filter(Boolean).join(" · ");
  return {
    title: `Mañana tenés ${t.especialidad}`,
    body: conLlevar(detalle, t.llevar),
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

/** A un cuidador Admin, cuando la persona no tiene avisos activos en ningún celular. */
export function payloadMedirPersona(d: { personaId: string; personaNombre: string; monitoreoId: string; que: string; hora: string }): PayloadPush {
  return {
    title: `Hora de medir ${d.que} de ${primerNombre(d.personaNombre)}`,
    body: "Podés cargar el valor desde su perfil.",
    url: urlFichaPersona(d.personaId, "editar"),
    tag: `medir-persona-${d.monitoreoId}-${d.hora}`,
    renotify: true,
    datos: { monitoreoId: d.monitoreoId },
  };
}

/** Stock por debajo del umbral (una vez por día por medicamento). */
export function payloadStockBajo(s: { inventarioId: string; nombre: string; stock: number; fechaAR: string; forma?: unknown }): PayloadPush {
  const titulo =
    s.stock <= 0
      ? `Se terminó tu ${s.nombre}`
      : `Te ${s.stock === 1 ? "queda" : "quedan"} ${cantidadStock(s.forma, s.stock)} de ${s.nombre}`;
  return {
    title: titulo,
    body: "Para que lo pidas a tiempo.",
    url: seCuentaConFoto(s.forma) ? "/app/pastillas" : "/app/medicamentos",
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
  /** Las que la persona dijo "No la tomé" (057). */
  noTomadas?: { nombre: string; hora: string }[];
  fechaAR: string;
  rolDestino?: "editar" | "ver" | null;
}): PayloadPush {
  const nombre = primerNombre(d.personaNombre);
  const lista = (xs: { nombre: string; hora: string }[]) => {
    const primeras = xs.slice(0, 2).map((p) => `${p.nombre} (${horaCorta(p.hora)})`);
    const resto = xs.length - primeras.length;
    return `${primeras.join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`;
  };
  const noTomadas = d.noTomadas ?? [];
  const partes = [
    d.pendientes.length > 0 ? `Quedó sin tomar: ${lista(d.pendientes)}.` : null,
    noTomadas.length > 0 ? `Dijo que no tomó: ${lista(noTomadas)}.` : null,
  ].filter(Boolean);
  const cuerpo = partes.length === 0 ? "Completó todas sus tomas de hoy." : partes.join(" ");
  return {
    title: `${nombre} tomó ${d.tomadas} de ${d.total} hoy`,
    body: cuerpo,
    url: urlFichaPersona(d.personaId, d.rolDestino),
    tag: `resumen-dia-${d.personaId}-${d.fechaAR}`,
  };
}

/** 09:00 del cumpleaños, a la propia persona. */
export function payloadCumpleanosPropio(d: { personaId: string; nombre: string; edad: number; fechaAR: string }): PayloadPush {
  return {
    title: `¡Feliz cumpleaños, ${primerNombre(d.nombre)}!`,
    body: `Hoy cumplís ${d.edad}. Todo el equipo de vita te manda un abrazo.`,
    url: "/app",
    tag: `cumpleanos-${d.personaId}-${d.fechaAR}`,
  };
}

/** 09:00 del cumpleaños de la persona cuidada, a sus cuidadores. */
export function payloadCumpleanosPersona(d: { personaId: string; personaNombre: string; edad: number; fechaAR: string; rolDestino?: "editar" | "ver" | null }): PayloadPush {
  const nombre = primerNombre(d.personaNombre);
  return {
    title: `Hoy cumple ${nombre}`,
    body: `Cumple ${d.edad}. Es un buen día para mandarle un saludo.`,
    url: urlFichaPersona(d.personaId, d.rolDestino),
    tag: `cumpleanos-persona-${d.personaId}-${d.fechaAR}`,
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
  llevar?: unknown;
  rolDestino?: "editar" | "ver" | null;
}): PayloadPush {
  const detalle = [horaCorta(t.hora), t.profesional?.trim() || null].filter(Boolean).join(" · ");
  return {
    title: `Mañana ${primerNombre(t.personaNombre)} tiene ${t.especialidad}`,
    body: conLlevar(detalle, t.llevar),
    url: urlFichaPersona(t.personaId, t.rolDestino),
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
  forma?: unknown;
  rolDestino?: "editar" | "ver" | null;
}): PayloadPush {
  const quien = primerNombre(s.personaNombre);
  const titulo =
    s.stock <= 0
      ? `A ${quien} se le terminó el ${s.nombre}`
      : `A ${quien} le ${s.stock === 1 ? "queda" : "quedan"} ${cantidadStock(s.forma, s.stock)} de ${s.nombre}`;
  return {
    title: titulo,
    body: "Para que lo pida a tiempo.",
    url: urlFichaPersona(s.personaId, s.rolDestino),
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

/**
 * Push al cuidador: la persona pidió ayuda (SOS explícito). Sin botones de acción y
 * con `requireInteraction`: no se cierra sola. No pasa por las preferencias de avisos
 * de familia ni por el silencio nocturno (ninguno de los dos se consulta al entregarlo).
 */
export function payloadPedidoAyuda(d: { personaId: string; personaNombre: string; motivo: string; rolDestino?: "editar" | "ver" | null }): PayloadPush {
  return {
    title: `${d.personaNombre} pidió ayuda`,
    body: d.motivo || "Necesita que te comuniques lo antes posible.",
    url: urlFichaPersona(d.personaId, d.rolDestino),
    tag: `pedido-ayuda-${d.personaId}`,
    requireInteraction: true,
    renotify: true,
    datos: { personaId: d.personaId },
  };
}

/** Al cuidador: la persona marcó que quiere ir acompañada a un turno (alta, o cambio de día/hora). */
export function payloadTurnoAcompanado(t: {
  personaId: string;
  personaNombre: string;
  turnoId: string;
  especialidad: string;
  fecha: string;
  hora: string;
  rolDestino?: "editar" | "ver" | null;
}): PayloadPush {
  return {
    title: `${primerNombre(t.personaNombre)} pidió compañía para su turno`,
    body: `${t.especialidad} · ${fechaHoraTurnoTexto(t.fecha, t.hora)}`,
    url: urlFichaPersona(t.personaId, t.rolDestino),
    tag: `turno-acompanado-${t.turnoId}`,
    datos: { personaId: t.personaId, turnoId: t.turnoId },
  };
}

/** El día anterior (20:00), al cuidador: "Mañana Elsa tiene turno de Cardiología a las 10:30 y pidió compañía". */
export function payloadTurnoAcompanadoDiaAntes(t: {
  personaId: string;
  personaNombre: string;
  turnoId: string;
  especialidad: string;
  hora: string;
  llevar?: unknown;
  rolDestino?: "editar" | "ver" | null;
}): PayloadPush {
  return {
    title: `Mañana ${primerNombre(t.personaNombre)} tiene turno de ${t.especialidad}`,
    body: conLlevar(`A las ${horaCorta(t.hora)} · pidió compañía.`, t.llevar),
    url: urlFichaPersona(t.personaId, t.rolDestino),
    tag: `turno-acompanado-dia-antes-${t.turnoId}`,
  };
}
