import type { DiaSemana, MomentoDia } from "@/lib/medicamentos/tipos";

// Las tools que ve el modelo hablan inglés (mismo vocabulario que el
// `agent/README.md` original de Vitapp — morning/midday/night,
// monday..sunday) para que el prompt/tool-calling sea consistente con
// cualquier documentación en inglés que se le pase al modelo. La base de
// datos y la UI son en español (`momento_dia`, `dias_recurrentes`) — estos
// mapeos son la única frontera entre ambos mundos.

const MOMENTO_DIA_DESDE_INGLES: Record<string, MomentoDia> = {
  morning: "mañana",
  midday: "mediodia",
  afternoon: "tarde",
  night: "noche",
};

const MOMENTO_DIA_A_INGLES: Record<MomentoDia, string> = {
  mañana: "morning",
  mediodia: "midday",
  tarde: "afternoon",
  noche: "night",
};

const DIA_DESDE_INGLES: Record<string, DiaSemana> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miercoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sabado",
  sunday: "domingo",
};

const DIA_A_INGLES: Record<DiaSemana, string> = {
  lunes: "monday",
  martes: "tuesday",
  miercoles: "wednesday",
  jueves: "thursday",
  viernes: "friday",
  sabado: "saturday",
  domingo: "sunday",
};

export function momentoDiaDesdeIngles(valor: string): MomentoDia {
  const encontrado = MOMENTO_DIA_DESDE_INGLES[valor.toLowerCase()];
  if (!encontrado) throw new Error(`time_of_day inválido: "${valor}"`);
  return encontrado;
}

export function momentoDiaAIngles(valor: MomentoDia): string {
  return MOMENTO_DIA_A_INGLES[valor];
}

export function diasDesdeIngles(valores: string[]): DiaSemana[] {
  return valores.map((v) => {
    const encontrado = DIA_DESDE_INGLES[v.toLowerCase()];
    if (!encontrado) throw new Error(`recurring_day inválido: "${v}"`);
    return encontrado;
  });
}

export function diasAIngles(valores: DiaSemana[]): string[] {
  return valores.map((v) => DIA_A_INGLES[v]);
}

/**
 * `measured_at` del modelo ("2026-11-10T09:30", hora de Argentina) a ISO con
 * zona. undefined si no vino; "invalida" si no tiene ese formato (la fecha
 * futura la rechaza validarMedicion).
 */
export function medidoAtDesdeModelo(valor: unknown): string | undefined | "invalida" {
  if (valor === undefined || valor === null || (typeof valor === "string" && valor.trim() === "")) return undefined;
  if (typeof valor !== "string") return "invalida";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(valor.trim());
  if (!m) return "invalida";
  const [anio, mes, dia] = m[1].split("-").map(Number);
  const [hora, minuto] = m[2].split(":").map(Number);
  // Ida y vuelta: un 30 de febrero no se "corre" a marzo, se rechaza.
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const fechaReal = fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  if (!fechaReal || hora > 23 || minuto > 59) return "invalida";
  return `${m[1]}T${m[2]}:00-03:00`;
}
