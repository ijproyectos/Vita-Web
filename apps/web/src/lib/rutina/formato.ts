const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// "2026-04-21" -> "mar 21 abr" (mismo formato que DateInput/TurnoCard del diseño).
export function formatoFechaCorta(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  if (isNaN(d.getTime())) return fechaISO;
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Para la tarjeta de turno: día + mes por separado ("21" / "ABR").
export function diaYMes(fechaISO: string): { dia: string; mes: string } {
  const d = new Date(`${fechaISO}T00:00:00`);
  if (isNaN(d.getTime())) return { dia: "—", mes: "" };
  return { dia: String(d.getDate()), mes: MESES[d.getMonth()].toUpperCase() };
}

const ZONA_AR = "America/Argentina/Buenos_Aires";

// Fecha calendario (YYYY-MM-DD) en hora de Argentina. `toISOString()` da la
// fecha UTC, que entre las 21:00 y las 23:59 AR ya es "mañana" — por eso los
// chips "Hoy/Mañana" y el contexto de fecha del chat usan esto.
export function fechaISOEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_AR }).format(fecha);
}

export function fechaDeHoyISO(): string {
  return fechaISOEnAR();
}

export function fechaConOffset(offsetDias: number): string {
  return fechaISOEnAR(new Date(new Date().getTime() + offsetDias * 24 * 60 * 60 * 1000));
}

// "sábado 11 de octubre de 2026, 20:56" — contexto de fecha para el chat.
export function descripcionAhoraEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_AR,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

// "Hoy" / "Mañana" / "Vie 06" — etiqueta corta del día de un turno (chip de
// las tarjetas de Home). Compara en hora AR, igual que fechaDeHoyISO().
export function etiquetaDia(fechaISO: string): string {
  if (fechaISO === fechaConOffset(0)) return "Hoy";
  if (fechaISO === fechaConOffset(1)) return "Mañana";
  const d = new Date(`${fechaISO}T00:00:00`);
  if (isNaN(d.getTime())) return fechaISO;
  const dia = DIAS[d.getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${String(d.getDate()).padStart(2, "0")}`;
}

// Saludo según la hora en Argentina ("BUENAS NOCHES," se pasa a mayúsculas por CSS).
export function saludoEnAR(fecha: Date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_AR, hour: "2-digit", hour12: false }).format(fecha)
  );
  if (h < 12) return "Buen día";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// "viernes 2 de mayo" — fecha larga en hora de Argentina (cabecera del modo
// simple). Se arma con las partes para no depender de la coma que agregan
// algunas versiones de ICU entre el día de la semana y el número.
export function fechaLargaEnAR(fecha: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_AR,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(fecha);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("weekday")} ${parte("day")} de ${parte("month")}`;
}
