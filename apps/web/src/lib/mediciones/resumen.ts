// Cálculos PUROS sobre las mediciones reales (sin I/O): resumen por tipo,
// escala de los gráficos y etiquetas de fecha. Nada se inventa — todo sale de
// las filas; con pocos datos, el resumen lo dice en vez de rellenar.

import { fechaConOffset, fechaISOEnAR, formatoFechaCorta } from "@/lib/rutina/formato";
import { ETIQUETA_MOMENTO, momentoDelDia } from "@/lib/rutina/momento";
import { dentroDeRango, formatearNumero, META_MEDICION, type Medicion, type TipoMedicion } from "./tipos";

const ZONA_AR = "America/Argentina/Buenos_Aires";
const INICIAL_DIA = ["D", "L", "M", "M", "J", "V", "S"];

/** Cuántos puntos muestran las tarjetas y el gráfico de detalle. */
export const PUNTOS_GRAFICO = 7;
/** Mínimos para armar el gráfico (mismos umbrales del diseño). */
export const MINIMO_TARJETA = 3;
export const MINIMO_DETALLE = 3;

export function horaAR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_AR,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** "Hoy · 08:10", "Ayer · 21:30", "mar 21 abr · 08:00". */
export function cuandoAR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dia = fechaISOEnAR(d);
  const hora = horaAR(iso);
  if (dia === fechaConOffset(0)) return `Hoy · ${hora}`;
  if (dia === fechaConOffset(-1)) return `Ayer · ${hora}`;
  return `${formatoFechaCorta(dia)} · ${hora}`;
}

/** "Mañana · 08:10" — momento del día (derivado de la hora AR) + hora. */
export function momentoYHora(iso: string): string {
  const hora = horaAR(iso);
  if (!hora) return "";
  return `${ETIQUETA_MOMENTO[momentoDelDia(hora)]} · ${hora}`;
}

/** Inicial del día de la semana (AR) de una medición; "Hoy" si es de hoy. */
export function inicialDia(iso: string, conHoy = false): string {
  const dia = fechaISOEnAR(new Date(iso));
  if (conHoy && dia === fechaConOffset(0)) return "Hoy";
  const d = new Date(`${dia}T00:00:00`);
  return isNaN(d.getTime()) ? "" : INICIAL_DIA[d.getDay()];
}

/** "Hoy" / "Ayer" / "mar 21 abr" (sin hora): título de cada fila del historial. */
export function diaAR(iso: string): string {
  const dia = fechaISOEnAR(new Date(iso));
  if (dia === fechaConOffset(0)) return "Hoy";
  if (dia === fechaConOffset(-1)) return "Ayer";
  return formatoFechaCorta(dia);
}

// ─── Resumen por tipo ───────────────────────────────────────────────────────

export type TonoBadge = "ok" | "aviso" | "neutro";

export type ResumenTipo = {
  tipo: TipoMedicion;
  n: number;
  ultima: Medicion | null;
  /** Hasta PUNTOS_GRAFICO mediciones, de la más vieja a la más nueva. */
  serie: Medicion[];
  promedio: number | null;
  minimo: number | null;
  maximo: number | null;
  /** Cambio entre la primera y la última de `serie` (null si hay < 2). */
  delta: number | null;
  /** De las evaluables contra el rango orientativo, cuántas quedaron fuera. */
  fueraDeRango: number;
  evaluables: number;
  badge: { texto: string; tono: TonoBadge };
  textoPromedio: string;
  insight: string;
};

function badgeDe(tipo: TipoMedicion, ultima: Medicion | null, previa: Medicion | null): ResumenTipo["badge"] {
  if (!ultima) return { texto: "Nuevo", tono: "neutro" };
  const dentro = dentroDeRango(ultima);
  if (dentro === true) return { texto: "En rango", tono: "ok" };
  if (dentro === false) return { texto: "Fuera de rango", tono: "aviso" };
  if (!previa) return { texto: "Nuevo", tono: "neutro" };
  const dif = ultima.valor - previa.valor;
  const dec = META_MEDICION[tipo].decimales;
  if (Math.abs(dif) < 10 ** -dec / 2) return { texto: "Sin cambios", tono: "neutro" };
  const signo = dif > 0 ? "↑" : "↓";
  return { texto: `${signo} ${formatearNumero(Math.abs(dif), dec)} ${META_MEDICION[tipo].unidad}`, tono: "neutro" };
}

/** `desc`: mediciones de UN tipo, más nuevas primero. */
export function resumirTipo(tipo: TipoMedicion, desc: Medicion[]): ResumenTipo {
  const meta = META_MEDICION[tipo];
  const serie = desc.slice(0, PUNTOS_GRAFICO).reverse();
  const n = serie.length;
  const valores = serie.map((m) => m.valor);
  const ultima = desc[0] ?? null;
  const previa = desc[1] ?? null;
  const promedio = n ? valores.reduce((a, b) => a + b, 0) / n : null;
  const delta = n > 1 ? valores[n - 1] - valores[0] : null;
  const dec = meta.decimales;

  const evaluadas = serie.map(dentroDeRango).filter((v): v is boolean => v !== null);
  const fueraDeRango = evaluadas.filter((v) => !v).length;

  const textoPromedio =
    n > 1
      ? `Promedio de las últimas ${n}: ${formatearNumero(promedio ?? 0, dec)}${tipo === "presion" ? " (máx.)" : ""}`
      : "Primera medición";

  let insight: string;
  if (n === 0) insight = "Todavía no hay mediciones.";
  else if (n === 1) insight = "Es la primera medición. Cuantas más cargues, más te puedo decir.";
  else {
    const cambio = `${delta! >= 0 ? "+" : "−"}${formatearNumero(Math.abs(delta!), dec)} ${meta.unidad}`;
    insight = `Cambió ${cambio} entre la primera y la última de estas ${n} mediciones.`;
    if (evaluadas.length > 0) {
      insight +=
        fueraDeRango === 0
          ? ` Todas las evaluables quedaron dentro del rango orientativo.`
          : ` ${fueraDeRango} de ${evaluadas.length} quedaron fuera del rango orientativo.`;
    }
  }

  return {
    tipo,
    n,
    ultima,
    serie,
    promedio,
    minimo: n ? Math.min(...valores) : null,
    maximo: n ? Math.max(...valores) : null,
    delta,
    fueraDeRango,
    evaluables: evaluadas.length,
    badge: badgeDe(tipo, ultima, previa),
    textoPromedio,
    insight,
  };
}

/** Agrupa una lista mixta (más nuevas primero) por tipo, conservando el orden. */
export function agruparPorTipo(desc: Medicion[]): Map<TipoMedicion, Medicion[]> {
  const mapa = new Map<TipoMedicion, Medicion[]>();
  for (const m of desc) {
    const lista = mapa.get(m.tipo);
    if (lista) lista.push(m);
    else mapa.set(m.tipo, [m]);
  }
  return mapa;
}

// ─── Geometría de los gráficos ────────────────────────────────────────────

export type Escala = {
  x: (i: number) => number;
  y: (v: number) => number;
  puntos: string;
};

/**
 * Escala lineal en un viewBox de 300 de ancho. `yAbajo` es la base y
 * `altoUtil` el alto disponible hacia arriba. `incluir` amplía el dominio
 * (p. ej. los bordes del rango de referencia) y `pad` agrega aire (fracción).
 */
export function crearEscala(valores: number[], yAbajo: number, altoUtil: number, incluir: number[] = [], pad = 0): Escala {
  const todos = [...valores, ...incluir];
  const lo0 = Math.min(...todos);
  const hi0 = Math.max(...todos);
  const aire = ((hi0 - lo0) || 1) * pad;
  const lo = lo0 - aire;
  const span = hi0 + aire - lo || 1;
  const n = valores.length;
  const x = (i: number) => (n > 1 ? i * (300 / (n - 1)) : 150);
  const y = (v: number) => yAbajo - ((v - lo) / span) * altoUtil;
  return { x, y, puntos: valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") };
}
