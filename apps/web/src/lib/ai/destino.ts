import type { MiembroFamilia } from "@/lib/familia/tipos";
import { limpiarDato } from "@/lib/ai/limpiar";
import { mencionaFamiliar } from "@/lib/ai/respuesta";

// Única fuente de verdad de qué tools ESCRIBEN datos (la usan la validación
// de destino, la confirmación y el dedupe de lib/chat/pedidos.ts).
export const TOOLS_DE_ESCRITURA = new Set([
  "add_medication",
  "update_schedule",
  "delete_schedule",
  "mark_taken",
  "mark_all_taken",
  "add_appointment",
  "update_health_profile",
  "add_condition",
  "add_allergy",
]);

// Escrituras CLÍNICAS o destructivas: sobre otra persona, la confirmación tiene
// que estar ATADA a esa acción exacta (el botón con el id de la pendiente, o un
// "sí" tipeado mientras sea la única pendiente). `mark_all_taken` además
// silencia la alerta de dosis vencida a los cuidadores.
export const TOOLS_CONFIRMACION_ATADA = new Set(["mark_taken", "mark_all_taken", "delete_schedule", "update_schedule"]);

// Borrar o cambiar el horario de un medicamento pide confirmación del servidor
// SIEMPRE, también sobre los datos propios (se pierde historial / cambia cuándo suena).
export const TOOLS_CONFIRMACION_PROPIA = new Set(["delete_schedule", "update_schedule"]);

// Tools que leen o escriben datos de una persona: son las únicas que aceptan
// `persona_id`. set_avatar_mood es un efecto de interfaz, sin destino.
export const TOOLS_CON_DESTINO = new Set([
  ...TOOLS_DE_ESCRITURA,
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
  | {
      ok: false;
      contenido: string;
      accionUI?: AccionOpciones;
      /**
       * Falta saber para quién es la escritura: pedidos.ts guarda una pendiente por
       * candidato y arma los botones "Para X" atados a ellas (una sola ronda).
       */
      faltaDestino?: { candidatos: { id: string; nombre: string }[] };
    };

/**
 * Botones de respuesta rápida bajo el mensaje de vita. Los arma el SERVIDOR (no
 * el modelo) para que las opciones sean siempre las correctas; el cliente manda
 * el texto exacto de la opción como un mensaje normal del usuario. No escribe nada.
 * `vinculos` ata una opción afirmativa (texto de la opción -> id de la acción
 * pendiente guardada en el servidor): al tocarla el cliente manda además ese id
 * como `confirmacionId`, y solo así se confirma una acción atada.
 */
export type AccionOpciones = { type: "opciones_confirmacion"; opciones: string[]; vinculos?: Record<string, string> };

export function opcionesConfirmarPara(nombreCrudo: string, confirmacionId?: string | null): AccionOpciones {
  const nombre = limpiarDato(nombreCrudo);
  const afirmativa = `Sí, para ${nombre}`;
  return {
    type: "opciones_confirmacion",
    opciones: [afirmativa, "No, es para mí", "Cancelar"],
    ...(confirmacionId ? { vinculos: { [afirmativa]: confirmacionId } } : {}),
  };
}

/** Confirmar/Cancelar de una acción destructiva guardada; "Confirmar" va atado al id de la pendiente. */
export function opcionesConfirmarAccion(pendienteId?: string | null): AccionOpciones {
  return {
    type: "opciones_confirmacion",
    opciones: ["Confirmar", "Cancelar"],
    ...(pendienteId ? { vinculos: { Confirmar: pendienteId } } : {}),
  };
}

/** Texto para el modelo cuando una borrada/cambio de horario quedó esperando el Confirmar. */
export function mensajeEsperandoConfirmacion(texto: string): string {
  return `ESPERANDO CONFIRMACIÓN: NO se ejecutó nada todavía. La app le muestra al usuario la pregunta "${limpiarDato(texto, 300)}" con los botones Confirmar y Cancelar. Decile con tus palabras, en una frase, esa misma pregunta (nombre, hora, persona si es otra, y lo que se pierde o cambia) y esperá. NUNCA digas que ya se borró o se cambió: lo confirma el servidor. Solo si en un mensaje POSTERIOR el usuario dice que sí, volvé a llamar a la tool con exactamente los mismos datos. No la llames de nuevo en el mismo turno.`;
}

/** `ids[i]` es el id de la pendiente de `nombres[i]` (opcional). */
export function opcionesElegirDestino(nombresCrudos: string | string[], ids?: (string | null | undefined)[]): AccionOpciones {
  const lista = Array.isArray(nombresCrudos) ? nombresCrudos : [nombresCrudos];
  const nombres = lista.map((n) => limpiarDato(n));
  const vinculos: Record<string, string> = {};
  nombres.forEach((n, i) => {
    const id = ids?.[i];
    if (id) vinculos[`Para ${n}`] = id;
  });
  return {
    type: "opciones_confirmacion",
    opciones: [...nombres.map((n) => `Para ${n}`), "Para mí", "Cancelar"],
    ...(Object.keys(vinculos).length > 0 ? { vinculos } : {}),
  };
}

export function mensajeFaltaConfirmacion(nombreCrudo: string): string {
  const nombre = limpiarDato(nombreCrudo);
  return `FALTA CONFIRMACIÓN: esta acción es para ${nombre}, no para quien está chateando, y NO se ejecutó. La app ya le muestra al usuario los botones de confirmación: hacé UNA sola pregunta breve, nombrando a ${nombre} y la acción exacta (por ejemplo "¿Le cargo Vitamina C a las 12:00 a ${nombre}?"), y esperá su respuesta. No la repitas ni agregues otra confirmación aparte. Solo si en un mensaje POSTERIOR dice que sí (o toca el botón), volvé a llamar a la tool con los mismos datos. Nunca vuelvas a llamarla en el mismo turno en que se lo preguntás.`;
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
  ctx: { usuarioId: string; familia: MiembroFamilia[]; abiertoId?: string; mensajeUsuario?: string }
): DestinoResuelto {
  const propio: DestinoResuelto = {
    ok: true,
    destinoId: ctx.usuarioId,
    persona: null,
    ...(TOOLS_CONFIRMACION_PROPIA.has(nombreTool) ? { requiereConfirmacion: true } : {}),
  };
  if (!TOOLS_CON_DESTINO.has(nombreTool)) return propio;

  // Ausente = undefined, null o string vacío/solo espacios (el modelo a veces manda null).
  const ausente =
    input.persona_id === undefined ||
    input.persona_id === null ||
    (typeof input.persona_id === "string" && input.persona_id.trim() === "");
  if (ausente) {
    if (!TOOLS_DE_ESCRITURA.has(nombreTool)) return propio;
    const abierto = ctx.abiertoId ? ctx.familia.find((f) => f.id === ctx.abiertoId) : undefined;
    // Guardia de destino equivocado: sin persona_id una escritura cae en la cuenta
    // propia. Si hay un perfil de familiar abierto, o el mensaje nombra a un
    // familiar ("mi mamá", el nombre de alguien de la lista), no se asume nada.
    const mencion = ctx.mensajeUsuario ? mencionaFamiliar(ctx.mensajeUsuario, ctx.familia) : { menciona: false, candidatos: [] };
    const candidatos = abierto ? [abierto] : mencion.menciona ? mencion.candidatos : [];
    if (candidatos.length === 0) return propio;

    const editables = candidatos.filter((c) => c.rol === "editar").slice(0, 3);
    if (editables.length === 0) {
      const lector = limpiarDato(candidatos[0].nombre);
      return {
        ok: false,
        contenido: `Solo podés ver los datos de ${lector} (rol Lector): no podés cargar ni cambiar nada. Si la acción era para vos, repetí el pedido aclarando que es para vos (persona_id ${ctx.usuarioId}); si no, explicáselo al usuario. No se ejecutó nada.`,
      };
    }
    const nombres = editables.map((c) => limpiarDato(c.nombre));
    const lista = nombres.join(" / ");
    return {
      ok: false,
      contenido: `FALTA DESTINO: ${abierto ? `está abierto el perfil de ${lista} en pantalla` : `el mensaje nombra a un familiar (${lista})`} y no indicaste persona_id, así que NO se ejecutó nada. Preguntale al usuario "¿Es para vos o para ${nombres[0]}?" y esperá su respuesta. La app le muestra botones ${nombres.map((n) => `"Para ${n}"`).join(", ")}, "Para mí" y "Cancelar"; con "Para ${nombres[0]}" la acción se confirma sola: volvé a llamar a la tool con el persona_id de esa persona (de la lista de Personas) y los mismos datos. Con "Para mí" llamala con persona_id = ${ctx.usuarioId}.`,
      accionUI: opcionesElegirDestino(nombres),
      faltaDestino: { candidatos: editables.map((c) => ({ id: c.id, nombre: c.nombre })) },
    };
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
