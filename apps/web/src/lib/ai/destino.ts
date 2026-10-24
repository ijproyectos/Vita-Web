import type { MiembroFamilia } from "@/lib/familia/tipos";

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

// Tools que leen o escriben datos de una persona: son las únicas que aceptan
// `persona_id`. show_* y set_avatar_mood son efectos de interfaz, sin destino.
export const TOOLS_CON_DESTINO = new Set([
  ...TOOLS_DE_ESCRITURA,
  "list_today_medications",
  "list_all_medications",
  "list_today_appointments",
]);

export type DestinoResuelto =
  | {
      ok: true;
      /** Persona sobre la que actúa la tool (siempre un id válido: el usuario o un miembro de su familia). */
      destinoId: string;
      /** Nombre del miembro cuando el destino NO es quien chatea; null si es el propio usuario. */
      persona: string | null;
    }
  | { ok: false; contenido: string };

/**
 * ÚNICO lugar donde se valida a quién va una tool. `persona_id` ausente o vacío
 * = el usuario logueado. Si viene, tiene que ser el propio usuario o alguien de
 * `familia` (la lista real de vínculos aceptados, nunca lo que diga el modelo).
 * Escribir en otra persona exige rol `editar` y la confirmación explícita del
 * usuario (`confirmado: true`).
 *
 * La confirmación hoy es una convención entre el prompt y el input del modelo:
 * no hay una confirmación guardada en el servidor que el modelo no pueda
 * auto-declarar. Confirmaciones duras (token de un solo uso que emite la UI)
 * quedan como mejora futura; la RLS sigue siendo la autoridad final del acceso.
 */
export function resolverDestino(
  nombreTool: string,
  input: Record<string, unknown>,
  ctx: { usuarioId: string; familia: MiembroFamilia[] }
): DestinoResuelto {
  const propio: DestinoResuelto = { ok: true, destinoId: ctx.usuarioId, persona: null };
  if (!TOOLS_CON_DESTINO.has(nombreTool)) return propio;

  const crudo = typeof input.persona_id === "string" ? input.persona_id.trim() : "";
  if (!crudo || crudo === ctx.usuarioId) return propio;

  const miembro = ctx.familia.find((f) => f.id === crudo);
  if (!miembro) {
    return {
      ok: false,
      contenido:
        "No tenés acceso a esa persona. persona_id tiene que ser exactamente uno de los ids de la lista de Personas; no se ejecutó nada.",
    };
  }

  if (!TOOLS_DE_ESCRITURA.has(nombreTool)) return { ok: true, destinoId: miembro.id, persona: miembro.nombre };

  if (miembro.rol !== "editar") {
    return {
      ok: false,
      contenido: `Solo podés ver los datos de ${miembro.nombre} (rol Lector): no podés cargar ni cambiar nada. Explicáselo al usuario; si quiere editar, ${miembro.nombre} tiene que darle permiso de Admin desde su cuenta. No se ejecutó nada.`,
    };
  }

  if (input.confirmado !== true) {
    return {
      ok: false,
      contenido: `FALTA CONFIRMACIÓN: esta acción es para ${miembro.nombre}, no para quien está chateando, y NO se ejecutó. Preguntale al usuario de forma explícita, nombrando a ${miembro.nombre} y la acción exacta (por ejemplo "¿Le cargo Vitamina C a las 12:00 a ${miembro.nombre}?"), y esperá su respuesta. Solo si en un mensaje POSTERIOR dice que sí, volvé a llamar a la tool con los mismos datos y confirmado: true. Nunca pongas confirmado: true en el mismo turno en que se lo preguntás.`,
    };
  }

  return { ok: true, destinoId: miembro.id, persona: miembro.nombre };
}
