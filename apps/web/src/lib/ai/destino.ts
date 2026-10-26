import type { MiembroFamilia } from "@/lib/familia/tipos";
import { limpiarDato } from "@/lib/ai/limpiar";

// Única fuente de verdad de qué tools ESCRIBEN datos (la usan la validación
// de destino, la confirmación y el dedupe de lib/chat/pedidos.ts).
const ESCRITURAS_DE_DATOS = [
  "add_medication",
  "update_schedule",
  "delete_schedule",
  "mark_taken",
  "mark_all_taken",
  "add_appointment",
  "update_health_profile",
  "add_condition",
  "add_allergy",
];

// `recordar` (memoria) también ESCRIBE, así que entra al dedupe por pedido y al conteo de escrituras del
// registro. Pero NO tiene destino: la memoria es siempre del dueño que la cuenta (el "sobre quién" va en
// el propio input) y no pide confirmación de familia. Por eso no entra a TOOLS_CON_DESTINO.
export const TOOLS_DE_ESCRITURA = new Set([...ESCRITURAS_DE_DATOS, "recordar", "resolver_contradiccion"]);

// Tools que leen o escriben datos de una persona: son las únicas que aceptan
// `persona_id`. set_avatar_mood es un efecto de interfaz, sin destino.
export const TOOLS_CON_DESTINO = new Set([
  ...ESCRITURAS_DE_DATOS,
  "list_today_medications",
  "list_all_medications",
  "list_today_appointments",
  // Efectos de interfaz que muestran datos de una persona: llevan el destino
  // para que la tarjeta diga de quién es la rutina.
  "show_today_medications",
  "show_all_medications",
]);

export type DestinoResuelto =
  | {
      ok: true;
      /** Persona sobre la que actúa la tool (siempre un id válido: el usuario o un miembro de su familia). */
      destinoId: string;
      /** Nombre del miembro cuando el destino NO es quien chatea; null si es el propio usuario. */
      persona: string | null;
      /**
       * true cuando es una ESCRITURA sobre otra persona: la confirmación del
       * usuario es obligatoria y la hace cumplir el servidor (lib/chat/pedidos.ts).
       */
      requiereConfirmacion?: boolean;
    }
  | { ok: false; contenido: string; accionUI?: AccionOpciones };

/**
 * Botones de respuesta rápida bajo el mensaje de vita. Los arma el SERVIDOR (no
 * el modelo) para que las opciones sean siempre las correctas; el cliente manda
 * el texto exacto de la opción como un mensaje normal del usuario. No escribe nada.
 */
export type AccionOpciones = {
  type: "opciones_confirmacion";
  opciones: string[];
  /** Paralelo a `opciones`: qué manda cada botón en el body (confirmarId/cancelarId); null = solo el texto. */
  payloads?: ({ confirmarId: string } | { cancelarId: string } | null)[];
};

/** Confirmar/Cancelar de una acción destructiva guardada (borrar o cambiar un horario). */
export function opcionesConfirmarAccion(pendienteId: string): AccionOpciones {
  return {
    type: "opciones_confirmacion",
    opciones: ["Confirmar", "Cancelar"],
    payloads: [{ confirmarId: pendienteId }, { cancelarId: pendienteId }],
  };
}

export function opcionesConfirmarPara(nombreCrudo: string): AccionOpciones {
  const nombre = limpiarDato(nombreCrudo);
  return { type: "opciones_confirmacion", opciones: [`Sí, para ${nombre}`, "No, es para mí", "Cancelar"] };
}

export function opcionesElegirDestino(nombreCrudo: string): AccionOpciones {
  const nombre = limpiarDato(nombreCrudo);
  return { type: "opciones_confirmacion", opciones: [`Para ${nombre}`, "Para mí", "Cancelar"] };
}

export function mensajeFaltaConfirmacion(nombreCrudo: string): string {
  const nombre = limpiarDato(nombreCrudo);
  return `FALTA CONFIRMACIÓN: esta acción es para ${nombre}, no para quien está chateando, y NO se ejecutó. Preguntale al usuario de forma explícita, nombrando a ${nombre} y la acción exacta (por ejemplo "¿Le cargo Vitamina C a las 12:00 a ${nombre}?"), y esperá su respuesta. Solo si en un mensaje POSTERIOR dice que sí, volvé a llamar a la tool con los mismos datos. Nunca vuelvas a llamarla en el mismo turno en que se lo preguntás: el servidor no la ejecuta sin una confirmación de un mensaje posterior.`;
}

/**
 * ÚNICO lugar donde se valida a quién va una tool. `persona_id` AUSENTE = el
 * usuario logueado; si viene, tiene que ser un string que sea el propio usuario
 * o alguien de `familia` (la lista real de vínculos aceptados, nunca lo que diga
 * el modelo): un valor mal formado se rechaza, no cae al propio usuario.
 * Escribir en otra persona exige rol `editar` y devuelve `requiereConfirmacion`:
 * la confirmación la hace cumplir el servidor (pedidos.ts), la RLS sigue siendo
 * la autoridad final del acceso. Si hay un perfil de familiar abierto en pantalla
 * (`abiertoId`) y una ESCRITURA llega sin persona_id, no se asume nada: se le
 * pide al modelo que confirme para quién es.
 */
export function resolverDestino(
  nombreTool: string,
  input: Record<string, unknown>,
  ctx: { usuarioId: string; familia: MiembroFamilia[]; abiertoId?: string }
): DestinoResuelto {
  const propio: DestinoResuelto = { ok: true, destinoId: ctx.usuarioId, persona: null };
  if (!TOOLS_CON_DESTINO.has(nombreTool)) return propio;

  // Ausente = undefined, null o string vacío/solo espacios (el modelo a veces manda null).
  const ausente =
    input.persona_id === undefined ||
    input.persona_id === null ||
    (typeof input.persona_id === "string" && input.persona_id.trim() === "");
  if (ausente) {
    const abierto = ctx.abiertoId ? ctx.familia.find((f) => f.id === ctx.abiertoId) : undefined;
    if (abierto && TOOLS_DE_ESCRITURA.has(nombreTool)) {
      return {
        ok: false,
        contenido: `Está abierto el perfil de ${limpiarDato(abierto.nombre)} en pantalla y no indicaste persona_id, así que NO se ejecutó nada. Preguntale al usuario si la acción es para él o ella o para ${limpiarDato(abierto.nombre)}, y recién con su respuesta volvé a llamar pasando persona_id explícito (el id de ${limpiarDato(abierto.nombre)} de la lista de Personas, o ${ctx.usuarioId} para quien chatea). La app le muestra botones "Para ${limpiarDato(abierto.nombre)}", "Para mí" y "Cancelar".`,
        accionUI: opcionesElegirDestino(abierto.nombre),
      };
    }
    return propio;
  }

  const crudo = typeof input.persona_id === "string" ? input.persona_id.trim() : "";
  if (!crudo) {
    return {
      ok: false,
      contenido:
        "persona_id inválido: tiene que ser exactamente uno de los ids de la lista de Personas (o no pasarlo para quien chatea). No se ejecutó nada.",
    };
  }
  if (crudo === ctx.usuarioId) return propio;

  const miembro = ctx.familia.find((f) => f.id === crudo);
  if (!miembro) {
    return {
      ok: false,
      contenido:
        "No tenés acceso a esa persona. persona_id tiene que ser exactamente uno de los ids de la lista de Personas; no se ejecutó nada.",
    };
  }

  const nombreLimpio = limpiarDato(miembro.nombre);
  if (!TOOLS_DE_ESCRITURA.has(nombreTool)) return { ok: true, destinoId: miembro.id, persona: nombreLimpio };

  if (miembro.rol !== "editar") {
    return {
      ok: false,
      contenido: `Solo podés ver los datos de ${nombreLimpio} (rol Lector): no podés cargar ni cambiar nada. Explicáselo al usuario; si quiere editar, ${nombreLimpio} tiene que darle permiso de Admin desde su cuenta. No se ejecutó nada.`,
    };
  }

  return { ok: true, destinoId: miembro.id, persona: nombreLimpio, requiereConfirmacion: true };
}
