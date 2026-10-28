// Clave semántica de dedupe de las tools de escritura (pura, sin I/O). Vive aparte de
// pedidos.ts (server-only) para poder probarla.

// Normaliza texto libre del modelo: minúsculas, sin tildes, espacios colapsados.
// "  Ibuprofeno  " y "ibuprofeno" dan lo mismo.
function norm(valor: unknown): string {
  if (valor === undefined || valor === null) return "";
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Horas "12:00" y "12:00:00" (o "9:00") dan lo mismo: HH:MM. Si no parece una hora, se normaliza como texto.
function normHora(valor: unknown): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(valor ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : norm(valor);
}

// "400mg", "400 mg" y "400 MG" son la misma dosis.
function normDosis(valor: unknown): string {
  return norm(valor).replace(/\s+/g, "");
}

/**
 * ÚNICO lugar donde se define la clave de dedupe de cada tool de escritura.
 * El input lo genera el modelo y en un reintento puede venir reformulado
 * (otra dosis escrita distinto, un motivo nuevo...), así que NO se usa el input
 * entero: solo los campos que identifican la acción, normalizados. Dos llamadas
 * con la misma identidad son "la misma acción" dentro del mismo pedido.
 * Se conserva el nombre de la tool en la clave.
 */
export function claveSemantica(nombre: string, input: Record<string, unknown>): string {
  const dias = Array.isArray(input.recurring_days) ? input.recurring_days.map(norm).sort().join(",") : "";
  // Los campos ya vienen normalizados (hora, dosis); el resto pasa por norm() al final.
  let campos: unknown[];
  switch (nombre) {
    case "add_medication":
      campos = [input.name, normDosis(input.dose), normHora(input.scheduled_time), input.time_of_day, dias];
      break;
    case "update_schedule":
      campos = [
        input.medication_name,
        normHora(input.medication_time_hint),
        normHora(input.scheduled_time),
        input.time_of_day,
        dias,
      ];
      break;
    case "delete_schedule":
    case "mark_taken":
      campos = [input.medication_name, normHora(input.medication_time_hint)];
      break;
    case "mark_all_taken":
      campos = [];
      break;
    case "add_appointment":
      campos = [input.date, normHora(input.time), input.specialty, input.professional, input.place];
      break;
    case "update_health_profile":
      campos = [input.gender, input.blood_type, input.height_cm, input.weight_kg, input.health_insurance];
      break;
    case "add_condition":
      campos = [input.label, input.type];
      break;
    case "add_allergy":
      campos = [input.name];
      break;
    default:
      campos = [JSON.stringify(input)];
  }
  return `${nombre}:${campos.map(norm).join("|")}`;
}
