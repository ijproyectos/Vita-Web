import type { DiaSemana } from "./tipos";

// "¿Cuándo lo toma?" (V7): días de la semana y hasta cuándo. Las fechas son
// "YYYY-MM-DD" en hora de Argentina, el mismo criterio que `medicamentos_tomas.fecha`.

export type HastaCuando = "siempre" | 1 | 7 | 10 | 30 | "fecha";

export const OPCIONES_HASTA: { valor: HastaCuando; etiqueta: string }[] = [
  { valor: "siempre", etiqueta: "Siempre" },
  { valor: 1, etiqueta: "Solo hoy" },
  { valor: 7, etiqueta: "7 días" },
  { valor: 10, etiqueta: "10 días" },
  { valor: 30, etiqueta: "1 mes" },
  { valor: "fecha", etiqueta: "Elegir fecha" },
];

export const DIAS_CUANDO: { dia: DiaSemana; letra: string; corto: string }[] = [
  { dia: "lunes", letra: "L", corto: "Lun" },
  { dia: "martes", letra: "M", corto: "Mar" },
  { dia: "miercoles", letra: "X", corto: "Mié" },
  { dia: "jueves", letra: "J", corto: "Jue" },
  { dia: "viernes", letra: "V", corto: "Vie" },
  { dia: "sabado", letra: "S", corto: "Sáb" },
  { dia: "domingo", letra: "D", corto: "Dom" },
];

export type CuandoForm = { dias: DiaSemana[]; hasta: HastaCuando; fechaElegida: string };

export const CUANDO_INICIAL: CuandoForm = { dias: [], hasta: "siempre", fechaElegida: "" };

export function fechaHoyAR(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** Último día de tratamiento (inclusive), o null si no tiene fin. */
export function fechaFinDe(cuando: Pick<CuandoForm, "hasta" | "fechaElegida">, hoy: string): string | null {
  if (cuando.hasta === "siempre") return null;
  if (cuando.hasta === "fecha") return cuando.fechaElegida || null;
  return sumarDias(hoy, cuando.hasta - 1);
}

export function resumenCuando(cuando: CuandoForm, hoy: string): string {
  const orden = DIAS_CUANDO.filter((d) => cuando.dias.includes(d.dia)).map((d) => d.corto);
  const dias = orden.length === 0 ? "Todos los días" : orden.join(" · ");
  const fin = fechaFinDe(cuando, hoy);
  let hasta: string;
  if (cuando.hasta === "siempre") hasta = "sin fecha de fin";
  else if (cuando.hasta === 1) hasta = "solo hoy";
  else if (cuando.hasta === "fecha") hasta = fin ? `hasta el ${ddmm(fin)}` : "elegí la fecha";
  else hasta = `${cuando.hasta} días, hasta el ${ddmm(fin!)}`;
  return `${dias} · ${hasta}`;
}

/** Elegir o sacar un día; los 7 elegidos equivalen a "todos" (lista vacía). */
export function alternarDia(dias: DiaSemana[], dia: DiaSemana): DiaSemana[] {
  const nuevos = dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia];
  return nuevos.length === DIAS_CUANDO.length ? [] : nuevos;
}

/** ¿El tratamiento sigue vigente esa fecha? `fecha_fin` es inclusive; sin ella no termina. */
export function vigenteEnFecha(medicamento: { fecha_fin?: string | null }, fecha: string): boolean {
  return !medicamento.fecha_fin || fecha <= medicamento.fecha_fin.slice(0, 10);
}

/** Fecha real "YYYY-MM-DD", o null. */
export function fechaValida(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? valor : null;
}
