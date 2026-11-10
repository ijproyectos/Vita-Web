// Tarjetas de un mensaje de vita: cuáles se guardan y cómo se agrupan. Lógica pura.

export type Tarjeta = { type: string; [clave: string]: unknown };
export type TarjetaAgrupada = Tarjeta | { type: "grupo"; tipo: string; items: Tarjeta[]; persona: string | null };

const MAX_TARJETAS = 12;

// Las demás no se guardan a propósito: el estado de ánimo y los botones de
// confirmación son del momento, y "Deshacer" de un recuerdo no debe quedar viejo.
const GUARDABLES = new Set([
  "medication_added",
  "appointment_added",
  "show_today_medications",
  "show_all_medications",
  "open_screen",
  "medication_taken",
  "all_medications_taken",
  "profile_updated",
  "condition_added",
  "allergy_added",
  "measurement_added",
]);

const AGRUPABLES = new Set(["medication_added", "appointment_added", "medication_taken"]);
const UNA_SOLA = new Set(["show_today_medications", "show_all_medications"]);

export function tarjetasParaGuardar(acciones: Tarjeta[]): Tarjeta[] {
  return acciones.filter((a) => GUARDABLES.has(a.type)).slice(-MAX_TARJETAS);
}

/** Lo que viene de la base no se confía tal cual. */
export function leerTarjetas(crudo: unknown): Tarjeta[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.filter((t): t is Tarjeta => !!t && typeof t === "object" && typeof (t as Tarjeta).type === "string");
}

/** Dos o más del mismo tipo van juntas, donde apareció la primera. De "Hoy" y "Tus remedios" queda la última. */
export function agruparTarjetas(tarjetas: Tarjeta[]): TarjetaAgrupada[] {
  const salida: TarjetaAgrupada[] = [];
  const hechos = new Set<string>();
  tarjetas.forEach((t, i) => {
    if (UNA_SOLA.has(t.type)) {
      if (tarjetas.slice(i + 1).every((o) => o.type !== t.type)) salida.push(t);
      return;
    }
    if (!AGRUPABLES.has(t.type)) return void salida.push(t);
    if (hechos.has(t.type)) return;
    hechos.add(t.type);
    const items = tarjetas.filter((o) => o.type === t.type);
    if (items.length === 1) return void salida.push(t);
    const personas = new Set(items.map((o) => (typeof o.persona === "string" ? o.persona : null)));
    salida.push({ type: "grupo", tipo: t.type, items, persona: personas.size === 1 ? [...personas][0] : null });
  });
  return salida;
}

/**
 * Sin la migración 055 la tarjeta se pierde al reabrir: un "Esto te toca hoy:"
 * suelto no diría nada, así que se guarda un texto que se entienda solo.
 */
export function contenidoSinTarjetas(texto: string, tarjetas: Tarjeta[]): string {
  const hayLista = tarjetas.some((t) => UNA_SOLA.has(t.type));
  // Una respuesta que era solo tarjetas no puede quedar como un mensaje vacío.
  if (texto.trim() === "") return hayLista ? "Te mostré tu rutina." : "Listo.";
  return hayLista && texto.trim().endsWith(":") ? "Te mostré tu rutina." : texto;
}

const ZONA_AR = "America/Argentina/Buenos_Aires";

/** Título de una tarjeta "Hoy" ya guardada: el estado es de ese momento y tiene que notarse. */
export function tituloHoyGuardado(momentoISO: string, ahora: Date = new Date()): string {
  const momento = new Date(momentoISO);
  if (isNaN(momento.getTime())) return "Hoy";
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_AR }).format(d);
  if (dia(momento) === dia(ahora)) {
    return `Hoy, a las ${new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_AR, hour: "2-digit", minute: "2-digit", hour12: false }).format(momento)}`;
  }
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_AR, weekday: "long", day: "numeric", month: "long" }).format(momento).replace(",", "");
}
