// Espejo del atajo de producción (lib/ai/respuesta-fija.ts) para el eval: las tools NO se ejecutan, así que la tarjeta
// que devolvería una escritura exitosa se arma desde el input del modelo. Producción solo usa el atajo cuando la tool
// salió bien sobre la cuenta propia (una escritura a otra persona pide confirmación del servidor y sigue al modelo).
import { respuestaFija, type AccionTool, type ToolEjecutada } from "@/lib/ai/respuesta-fija";

type Llamada = { nombre: string; input: Record<string, unknown> };

const txt = (v: unknown): string => (typeof v === "string" ? v : "");

function accionSintetica(l: Llamada): AccionTool | undefined {
  const i = l.input;
  if (typeof i.persona_id === "string" && i.persona_id) return undefined; // otra persona: confirmación del servidor
  switch (l.nombre) {
    case "set_avatar_mood":
      return { type: "avatar_mood", mood: txt(i.mood) || "neutral" };
    case "add_medication": {
      const extras = Array.isArray(i.extra_times) ? i.extra_times.filter((h): h is string => typeof h === "string") : [];
      return { type: "medication_added", name: txt(i.name), dose: txt(i.dose) || null, time: [txt(i.scheduled_time), ...extras].join(" y ") };
    }
    case "add_appointment":
      return { type: "appointment_added", specialty: txt(i.specialty), date: txt(i.date), time: txt(i.time) };
    case "add_measurement": {
      const v = typeof i.secondary_value === "number" ? `${String(i.value)}/${i.secondary_value}` : String(i.value);
      return { type: "measurement_added", name: txt(i.type), value: v, measured_at: txt(i.measured_at) };
    }
    case "mark_taken":
      return { type: "medication_taken", medication_name: txt(i.medication_name), time: txt(i.medication_time_hint) };
    case "mark_all_taken":
      return { type: "all_medications_taken", count: 3 };
    default:
      return undefined; // remind_dose siempre pide confirmación; lo demás no es de escritura
  }
}

/**
 * Texto que producción diría SIN segunda llamada al modelo para este turno de tools, o null si seguiría el modelo.
 * `enlatados`: resultados de tool del caso; uno distinto de "OK." (confirmación pendiente, error, no tiene avisos...) indica
 * que la tool no escribió y por lo tanto no se usa el atajo.
 */
export function respuestaFijaDeEval(llamadas: Llamada[], enlatados: Record<string, string> = {}): string | null {
  if (llamadas.length === 0) return null;
  const tools: ToolEjecutada[] = llamadas.map((l) => ({
    nombre: l.nombre,
    accion: l.nombre === "set_avatar_mood" || (enlatados[l.nombre] ?? "OK.") === "OK." ? accionSintetica(l) : undefined,
  }));
  return respuestaFija(tools);
}
