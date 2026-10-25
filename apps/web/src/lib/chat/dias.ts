// Separadores de día del hilo único ("Hoy", "Ayer", "lunes 20 de octubre"). Lógica pura, en hora de
// Argentina (igual que el resto de la app: el día no es el de UTC).

const ZONA_AR = "America/Argentina/Buenos_Aires";

/** Día calendario (YYYY-MM-DD) de un instante, en hora de Argentina; "" si la fecha no es válida. */
export function claveDia(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_AR }).format(d);
}

function restarDias(clave: string, dias: number): string {
  const [a, m, d] = clave.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d - dias));
  return f.toISOString().slice(0, 10);
}

/** "Hoy", "Ayer" o "lunes 20 de octubre" (con el año si no es el actual). */
export function etiquetaDiaHilo(iso: string, ahora: Date = new Date()): string {
  const clave = claveDia(iso);
  if (!clave) return "";
  const hoy = claveDia(ahora.toISOString());
  if (clave === hoy) return "Hoy";
  if (clave === restarDias(hoy, 1)) return "Ayer";
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_AR,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(d);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const base = `${parte("weekday")} ${parte("day")} de ${parte("month")}`;
  return clave.slice(0, 4) === hoy.slice(0, 4) ? base : `${base} de ${parte("year")}`;
}

/** Corta una lista ascendente en grupos consecutivos del mismo día. */
export function agruparPorDia<T extends { timestamp: string }>(items: T[]): { clave: string; items: { item: T; indice: number }[] }[] {
  const grupos: { clave: string; items: { item: T; indice: number }[] }[] = [];
  items.forEach((item, indice) => {
    const clave = claveDia(item.timestamp);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.items.push({ item, indice });
    else grupos.push({ clave, items: [{ item, indice }] });
  });
  return grupos;
}
