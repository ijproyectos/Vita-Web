import { TOOLS_CONFIRMACION_PROPIA } from "@/lib/ai/destino";
import { diasDesdeIngles } from "@/lib/ai/mapeo";
import { esIndicacionComida, INDICACIONES_COMIDA, type IndicacionComida } from "@/lib/medicamentos/comidas";
import type { DatosActualizarHorario, DiaSemana, Medicamento } from "@/lib/medicamentos/tipos";
import { textoDosis } from "@/lib/medicamentos/tipos";
import { hhmm, resolverMedicamento } from "@/lib/medicamentos/resolucion";
import { momentoDelDia } from "@/lib/rutina/momento";

// Lógica PURA (sin DB ni server-only) de las confirmaciones de borrar / cambiar un
// horario: resolver a qué fila se refiere el modelo, comparar con lo que se le mostró
// al usuario, armar los textos y decidir si una respuesta autoriza una pendiente. La
// parte con I/O vive en pedidos.ts (el mismo mecanismo de pendientes por sesión que
// ya usan las escrituras sobre otra persona: `pendiente:<clave>` en acciones_agente).

function norm(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lo que mandó el modelo como indicación de comida: clave del catálogo o su etiqueta.
 * undefined = no la mandó; null = "none" (quitarla); "invalida" = fuera del catálogo
 * (no se guarda en silencio).
 */
export function leerIndicacionDelModelo(valor: unknown): IndicacionComida | null | undefined | "invalida" {
  if (valor === undefined || valor === null || valor === "") return undefined;
  if (typeof valor !== "string") return "invalida";
  if (norm(valor) === "none") return null;
  if (esIndicacionComida(valor)) return valor;
  return INDICACIONES_COMIDA.find((o) => norm(o.etiqueta) === norm(valor))?.clave ?? "invalida";
}

export const ERROR_INDICACION = `ERROR: esa indicación de comida no existe. No se guardó nada. Usá una de: ${INDICACIONES_COMIDA.map((o) => `${o.clave} ("${o.etiqueta}")`).join(", ")}, o preguntale al usuario cuál es.`;

export type SnapshotMedicamento = {
  id: string;
  nombre: string;
  dosis: string;
  hora_programada: string;
  dias_recurrentes: DiaSemana[];
};

export function tomarSnapshot(m: Medicamento): SnapshotMedicamento {
  return {
    id: m.id,
    nombre: m.nombre,
    dosis: textoDosis(m),
    hora_programada: m.hora_programada,
    dias_recurrentes: m.dias_recurrentes ?? [],
  };
}

/** true solo si la fila actual es la MISMA que se le mostró al usuario (id, nombre, dosis, hora y días). */
export function snapshotCoincide(snapshot: unknown, actual: Medicamento): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as Partial<SnapshotMedicamento>;
  if (s.id !== actual.id || s.nombre !== actual.nombre) return false;
  if ((s.dosis ?? "") !== textoDosis(actual)) return false;
  if (hhmm(s.hora_programada) !== hhmm(actual.hora_programada)) return false;
  const antes = [...(s.dias_recurrentes ?? [])].sort().join(",");
  const ahora = [...(actual.dias_recurrentes ?? [])].sort().join(",");
  return antes === ahora;
}

/**
 * Lo que se ejecuta al confirmar, siempre por id (nunca por nombre). Se guarda dentro
 * de la pendiente (`resultado.pendiente.objetivo`): la acción exacta que se le mostró.
 */
export type ObjetivoGuardado = {
  medicamentoId: string;
  snapshot: SnapshotMedicamento;
  /** La pregunta tal como la ve el usuario. */
  texto: string;
  cambios?: DatosActualizarHorario;
};

export function esObjetivoGuardado(valor: unknown): valor is ObjetivoGuardado {
  if (!valor || typeof valor !== "object") return false;
  const o = valor as Partial<ObjetivoGuardado>;
  return (
    typeof o.medicamentoId === "string" &&
    typeof o.texto === "string" &&
    !!o.snapshot &&
    typeof o.snapshot === "object" &&
    typeof (o.snapshot as Partial<SnapshotMedicamento>).id === "string"
  );
}

function descripcion(m: Pick<Medicamento, "nombre" | "dosis" | "unidad">): string {
  const dosis = textoDosis(m);
  return dosis ? `${m.nombre} ${dosis}` : m.nombre;
}

const DE_PERSONA = (persona: string | null) => (persona ? ` de ${persona}` : "");

/** La pregunta que ve el usuario. */
export function textoPropuesta(
  tool: "delete_schedule" | "update_schedule",
  persona: string | null,
  m: Medicamento,
  cambios?: DatosActualizarHorario
): string {
  const hora = hhmm(m.hora_programada);
  if (tool === "delete_schedule") {
    return `¿Borro ${descripcion(m)} de las ${hora}${DE_PERSONA(persona)}? También se borra su historial de tomas.`;
  }
  const c = cambios ?? {};
  const partes: string[] = [];
  if (c.horaProgramada) partes.push(`la hora a las ${hhmm(c.horaProgramada)}`);
  else if (c.momentoDia) partes.push(`el momento del día a ${c.momentoDia}`);
  if (c.diasRecurrentes) {
    partes.push(c.diasRecurrentes.length > 0 ? `los días a ${c.diasRecurrentes.join(", ")}` : "los días a todos los días");
  }
  if (c.indicacion !== undefined) {
    partes.push(
      c.indicacion === null
        ? "quitar la indicación de comida"
        : `la indicación de comida a "${INDICACIONES_COMIDA.find((o) => o.clave === c.indicacion)?.etiqueta ?? c.indicacion}"`
    );
  }
  return `¿Cambio ${descripcion(m)} de las ${hora}${DE_PERSONA(persona)}: ${partes.join(" y ")}?`;
}

/** Texto de éxito, armado con lo que se mostró (el snapshot), no con lo que haya quedado después. */
export function textoExito(
  tool: "delete_schedule" | "update_schedule",
  persona: string | null,
  snapshot: SnapshotMedicamento,
  cambios?: DatosActualizarHorario
): string {
  const que = snapshot.dosis ? `${snapshot.nombre} ${snapshot.dosis}` : snapshot.nombre;
  const hora = hhmm(snapshot.hora_programada);
  if (tool === "delete_schedule") return `Listo, borré ${que} de las ${hora}${DE_PERSONA(persona)}.`;
  const nueva = cambios?.horaProgramada ? ` Ahora es a las ${hhmm(cambios.horaProgramada)}.` : "";
  return `Listo, cambié ${que} de las ${hora}${DE_PERSONA(persona)}.${nueva}`;
}

/**
 * Valida y convierte los cambios que pidió el modelo (inglés, texto libre) a los del
 * núcleo, ANTES de guardar la pendiente: lo que se guarda es exactamente lo que se ejecuta.
 */
export function cambiosDeInput(input: Record<string, unknown>): { datos: DatosActualizarHorario } | { error: string } {
  const datos: DatosActualizarHorario = {};
  try {
    if (input.scheduled_time !== undefined && input.scheduled_time !== null && input.scheduled_time !== "") {
      const m = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(input.scheduled_time).trim());
      if (!m || Number(m[1]) > 23) return { error: `scheduled_time inválido: "${String(input.scheduled_time)}" (formato HH:MM).` };
      datos.horaProgramada = hhmm(`${m[1]}:${m[2]}`);
      // La hora es la única fuente de verdad del momento del día (igual que en add_medication).
      datos.momentoDia = momentoDelDia(datos.horaProgramada);
    } else if (input.time_of_day) {
      // The day period only follows from an hour: asking for it alone would let it drift from the hour.
      return { error: "Para cambiar el momento del día indicá la hora exacta (scheduled_time, HH:MM)." };
    }
    if (Array.isArray(input.recurring_days)) datos.diasRecurrentes = diasDesdeIngles(input.recurring_days as string[]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Datos inválidos." };
  }
  const indicacion = leerIndicacionDelModelo(input.meal_indication);
  if (indicacion === "invalida") return { error: ERROR_INDICACION };
  if (indicacion !== undefined) datos.indicacion = indicacion;
  if (
    datos.horaProgramada === undefined &&
    datos.momentoDia === undefined &&
    datos.diasRecurrentes === undefined &&
    datos.indicacion === undefined
  ) {
    return { error: "No indicaste qué cambiar (scheduled_time, time_of_day, recurring_days o meal_indication)." };
  }
  return { datos };
}

/**
 * Autorización de una pendiente por el mensaje/botón ACTUAL (lógica que hace cumplir
 * `confirmacionDelServidor`). Pura para poder probarla:
 * - el botón con el id de la pendiente autoriza siempre;
 * - un "sí" tipeado autoriza una acción común; una ATADA (clínica/destructiva) o nacida
 *   de "FALTA DESTINO" solo si es la ÚNICA pendiente vigente de la sesión;
 * - un "no" u "otro" nunca autoriza.
 */
export function autorizaPendiente(p: {
  confirmacionId?: string;
  pendienteId: string;
  respuesta: "si" | "no" | "otro";
  atada: boolean;
  origenDestino: boolean;
  /** Pendientes vigentes de la sesión (incluida ésta). */
  vigentesEnSesion: number;
}): boolean {
  if (p.confirmacionId && p.confirmacionId === p.pendienteId) return true;
  if (p.respuesta !== "si") return false;
  if (!p.atada && !p.origenDestino) return true;
  return p.vigentesEnSesion === 1;
}

/** true si la pendiente (creada en `creadaAt`) todavía está dentro de la ventana. Fecha inválida = vencida. */
export function pendienteVigente(creadaAt: string | null | undefined, ahoraMs: number, ventanaMs: number): boolean {
  const t = creadaAt ? new Date(creadaAt).getTime() : NaN;
  return Number.isFinite(t) && ahoraMs - t <= ventanaMs && t <= ahoraMs + 60_000;
}

/** El destino de la acción tiene que seguir siendo el propio usuario o alguien con rol editar (relectura al confirmar). */
export function destinoPermitido(
  destinoId: string,
  usuarioId: string,
  familia: readonly { id: string; rol: string }[]
): boolean {
  return destinoId === usuarioId || familia.some((f) => f.id === destinoId && f.rol === "editar");
}

export { hhmm, resolverMedicamento, TOOLS_CONFIRMACION_PROPIA };
