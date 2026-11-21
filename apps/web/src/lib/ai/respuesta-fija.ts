import { limpiarDato } from "@/lib/ai/limpiar";
import { fechaTurnoEnPalabras } from "@/lib/turnos/formato";

// Confirmación determinística de escrituras: cuando el turno del modelo solo pidió tools de escritura que
// salieron bien, el texto se arma desde sus resultados y se evita la segunda llamada al modelo (2-4 s).
// Lógica PURA (sin I/O ni `server-only`): la usan la ruta del chat y el eval.

export type AccionTool = { type: string; [clave: string]: unknown };
export type ToolEjecutada = { nombre: string; accion?: AccionTool };

/** Tool de escritura -> tarjeta que devuelve cuando SÍ se ejecutó. */
const ACCION_ESPERADA: Record<string, string> = {
  add_medication: "medication_added",
  add_appointment: "appointment_added",
  add_measurement: "measurement_added",
  mark_taken: "medication_taken",
  mark_all_taken: "all_medications_taken",
  remind_dose: "reminder_sent",
};

/** Efecto puramente visual: puede ir en el mismo turno sin impedir la respuesta fija. */
const TOOLS_NEUTRAS = new Set(["set_avatar_mood"]);

const s = (v: unknown, max = 60): string => (typeof v === "string" ? limpiarDato(v, max) : "");

/** "08:00", "08:00:00" o "8:00 y 20:00" -> ["8:00", "20:00"]. */
function horas(valor: unknown): string[] {
  if (typeof valor !== "string") return [];
  return valor
    .split(/\s*(?:,|\by\b)\s*/)
    .map((h) => h.trim().match(/^(\d{1,2}):(\d{2})/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => `${Number(m[1])}:${m[2]}`);
}

function listaY(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function minuscula(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** Una cláusula ("agendé Ibuprofeno 400 mg a las 8:00") por tool, o null si falta un dato imprescindible. */
function clausula(a: AccionTool): string | null {
  const persona = s(a.persona, 40);
  switch (a.type) {
    case "medication_added": {
      const nombre = s(a.name);
      if (!nombre) return null;
      const dosis = s(a.dose, 20);
      const hs = horas(a.time);
      const que = `${nombre}${dosis ? ` ${dosis}` : ""}`;
      const cuando = hs.length > 0 ? ` a las ${listaY(hs)}` : "";
      return persona ? `le agendé a ${persona} ${que}${cuando}` : `agendé ${que}${cuando}`;
    }
    case "appointment_added": {
      const esp = s(a.specialty);
      if (!esp) return null;
      const fecha = typeof a.date === "string" ? fechaTurnoEnPalabras(a.date.slice(0, 10)) : "";
      const hs = horas(a.time);
      const cuando = `${fecha ? ` para el ${fecha}` : ""}${hs.length > 0 ? ` a las ${hs[0]}` : ""}`;
      return persona ? `le agendé a ${persona} un turno de ${esp}${cuando}` : `agendé tu turno de ${esp}${cuando}`;
    }
    case "measurement_added": {
      const nombre = minuscula(s(a.name));
      const valor = s(a.value, 30);
      if (!nombre || !valor) return null;
      return persona ? `anoté la medición de ${nombre} de ${persona}: ${valor}` : `anoté tu medición de ${nombre}: ${valor}`;
    }
    case "medication_taken": {
      const nombre = s(a.medication_name);
      if (!nombre) return null;
      const hs = horas(a.time);
      const de = hs.length > 0 ? ` de las ${hs[0]}` : "";
      return `marqué ${nombre}${de} como tomado${persona ? ` para ${persona}` : ""}`;
    }
    case "all_medications_taken": {
      const n = typeof a.count === "number" && Number.isFinite(a.count) ? Math.floor(a.count) : 0;
      if (n < 1) return null; // "marqué 0" no se dice sin que el modelo lo explique
      const que = n === 1 ? "marqué 1 medicamento como tomado" : `marqué los ${n} medicamentos como tomados`;
      return `${que}${persona ? ` para ${persona}` : ""}`;
    }
    case "reminder_sent":
      return persona ? `le mandé el aviso a ${persona}` : "mandé el aviso";
    default:
      return null;
  }
}

/**
 * Texto de confirmación para un turno de tools, o null si no se puede decir de forma determinística
 * (alguna tool no es de escritura, falló, pide confirmación o no devolvió su tarjeta): ahí sigue el modelo.
 */
export function respuestaFija(tools: ToolEjecutada[]): string | null {
  const escrituras = tools.filter((t) => !TOOLS_NEUTRAS.has(t.nombre));
  if (escrituras.length === 0) return null;
  const clausulas: string[] = [];
  for (const t of escrituras) {
    const esperada = ACCION_ESPERADA[t.nombre];
    if (!esperada || t.accion?.type !== esperada) return null;
    const c = clausula(t.accion);
    if (!c) return null;
    clausulas.push(c);
  }
  return `Listo, ${listaY(clausulas)}.`;
}

const norm = (v: string): string =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Datos que el texto del modelo tiene que nombrar para que se considere que ya confirmó con detalle. */
function detallesRequeridos(a: AccionTool): string[] | null {
  switch (a.type) {
    case "medication_added":
      return [s(a.name), ...horas(a.time)];
    case "appointment_added":
      return [s(a.specialty), ...horas(a.time).slice(0, 1)];
    case "measurement_added":
      return [s(a.name), s(a.value, 30)];
    case "medication_taken":
      return [s(a.medication_name), ...horas(a.time).slice(0, 1)];
    case "all_medications_taken":
      return [String(a.count)];
    default:
      return null; // sin detalle propio: siempre se agrega la fija
  }
}

function nombraHora(texto: string, hora: string): boolean {
  const [h, m] = hora.split(":");
  return new RegExp(`\\b${h}[:.]${m}\\b|\\b${h}\\s*(?:hs?|horas)\\b|\\ba las ${h}\\b`).test(texto);
}

/**
 * Qué agregar al texto que el modelo ya escribió en el mismo turno: la confirmación fija si no dijo nada, o si su
 * texto es solo un preámbulo ("Listo, lo agendo"). Solo no se agrega si ya nombra los datos concretos de cada
 * escritura (por ejemplo el medicamento Y la hora).
 */
export function confirmacionAAgregar(textoPrevio: string, fija: string, tools: ToolEjecutada[] = []): string {
  const previo = textoPrevio.trim();
  if (!previo) return fija;
  const texto = norm(previo);
  const escrituras = tools.filter((t) => t.accion && !TOOLS_NEUTRAS.has(t.nombre));
  const cubierto =
    escrituras.length > 0 &&
    escrituras.every((t) => {
      const req = detallesRequeridos(t.accion as AccionTool);
      if (!req || req.length === 0) return false;
      return req.every((d) => (/^\d{1,2}:\d{2}$/.test(d) ? nombraHora(texto, d) : d !== "" && texto.includes(norm(d))));
    });
  return cubierto ? "" : `\n\n${fija}`;
}
