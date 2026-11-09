// Planes de medición ("Nuevo monitoreo", V7): qué medir, a qué horas y qué días.
// Lógica PURA, compartida por el formulario, la Rutina y el cron.

import { vigenteEnFecha, DIAS_CUANDO, fechaValida } from "@/lib/medicamentos/cuando";
import type { ComidaToma } from "@/lib/medicamentos/comidas";
import type { DiaSemana } from "@/lib/medicamentos/tipos";
import { horaAR } from "./resumen";
import {
  TIPOS_MEDICION,
  claveNombreOtra,
  esTipoRegistrable,
  metaDe,
  validarMetricaOtra,
  type Medicion,
  type MetaMedicion,
  type TipoMedicion,
  type TipoRegistrable,
} from "./tipos";

export const MAX_HORARIOS_PLAN = 4;

export type HorarioPlan = { hora: string } & ComidaToma;

export type Monitoreo = {
  id: string;
  usuario_id: string;
  tipo: TipoRegistrable;
  nombre_otra: string | null;
  unidad_otra: string | null;
  horarios: HorarioPlan[];
  dias_recurrentes: DiaSemana[];
  fecha_fin: string | null;
};

const FRASE_MEDIR: Record<TipoMedicion, string> = {
  presion: "la presión",
  glucemia: "la glucemia",
  peso: "el peso",
  pulso: "el pulso",
  saturacion: "la saturación",
  temperatura: "la temperatura",
};

type ConMetrica = Pick<Monitoreo, "tipo" | "nombre_otra">;

/** "la presión", "el peso", o el nombre de una "Otra" en minúscula. */
export function fraseMedir(plan: ConMetrica): string {
  return plan.tipo === "otra" ? claveNombreOtra(plan.nombre_otra) : FRASE_MEDIR[plan.tipo];
}

export function esDeLaMetrica(m: Pick<Medicion, "tipo" | "nombre_otra">, plan: ConMetrica): boolean {
  if (m.tipo !== plan.tipo) return false;
  return plan.tipo !== "otra" || claveNombreOtra(m.nombre_otra) === claveNombreOtra(plan.nombre_otra);
}

export function planAplica(plan: Pick<Monitoreo, "dias_recurrentes" | "fecha_fin">, dia: DiaSemana, fecha: string): boolean {
  const toca = plan.dias_recurrentes.length === 0 || plan.dias_recurrentes.includes(dia);
  return toca && vigenteEnFecha(plan, fecha);
}

const ADELANTO_MIN = 60;

function aMinutos(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

export type TramoHoy<M> = { hora: string; medicion: M | null };

/**
 * A qué horario corresponde cada medición del día: cuenta desde 60 min antes de
 * ese horario hasta 60 min antes del siguiente; si dos horarios están a menos
 * de 2 h, el corte es el punto medio. Una medición suelta a la tarde no apaga
 * el aviso de la noche. `medicionesHoy`: de esta métrica, cualquier orden.
 */
export function tramosDeHoy<M extends Pick<Medicion, "medido_at">>(horarios: { hora: string }[], medicionesHoy: M[]): TramoHoy<M>[] {
  const horas = horarios.map((h) => h.hora).sort();
  const conMinutos = medicionesHoy
    .map((m) => ({ m, min: aMinutos(horaAR(m.medido_at) || "00:00"), iso: m.medido_at }))
    .sort((a, b) => b.iso.localeCompare(a.iso));
  const adelanto = (anterior: string, actual: string) => Math.min(ADELANTO_MIN, Math.floor((aMinutos(actual) - aMinutos(anterior)) / 2));
  return horas.map((hora, i) => {
    const desde = aMinutos(hora) - (i > 0 ? adelanto(horas[i - 1], hora) : ADELANTO_MIN);
    const hasta = i + 1 < horas.length ? aMinutos(horas[i + 1]) - adelanto(hora, horas[i + 1]) : 24 * 60;
    return { hora, medicion: conMinutos.find((x) => x.min >= desde && x.min < hasta)?.m ?? null };
  });
}

export type Metrica = {
  clave: string;
  tipo: TipoRegistrable;
  nombreOtra: string | null;
  unidadOtra: string | null;
  meta: MetaMedicion;
  /** Más nuevas primero; vacío si solo existe el plan. */
  mediciones: Medicion[];
  plan: Monitoreo | null;
};

/** Métricas a mostrar: las que tienen mediciones o un plan. Primero las fijas. */
export function metricasDe(desc: Medicion[], planes: Monitoreo[]): Metrica[] {
  const fijas: Metrica[] = [];
  for (const tipo of TIPOS_MEDICION) {
    const mediciones = desc.filter((m) => m.tipo === tipo);
    const plan = planes.find((p) => p.tipo === tipo) ?? null;
    if (mediciones.length > 0 || plan) {
      fijas.push({ clave: tipo, tipo, nombreOtra: null, unidadOtra: null, meta: metaDe({ tipo }), mediciones, plan });
    }
  }
  const claves = new Set<string>();
  for (const m of desc) if (m.tipo === "otra") claves.add(claveNombreOtra(m.nombre_otra));
  for (const p of planes) if (p.tipo === "otra") claves.add(claveNombreOtra(p.nombre_otra));
  const otras = [...claves].map((clave): Metrica => {
    const mediciones = desc.filter((m) => m.tipo === "otra" && claveNombreOtra(m.nombre_otra) === clave);
    const plan = planes.find((p) => p.tipo === "otra" && claveNombreOtra(p.nombre_otra) === clave) ?? null;
    const nombreOtra = plan?.nombre_otra ?? mediciones[0]?.nombre_otra ?? clave;
    const unidadOtra = plan?.unidad_otra ?? mediciones[0]?.unidad_otra ?? null;
    return { clave: `otra:${clave}`, tipo: "otra", nombreOtra, unidadOtra, meta: metaDe({ tipo: "otra", nombre_otra: nombreOtra, unidad_otra: unidadOtra }), mediciones, plan };
  });
  return [...fijas, ...otras];
}

// ─── Lectura y validación ──────────────────────────────────────────────────

const CON_COMIDA = ["antes", "con", "despues", "no-importa"] as const;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Solo los horarios bien formados; un JSON raro nunca rompe la pantalla ni el cron. */
export function horariosDesde(crudo: unknown): HorarioPlan[] {
  if (!Array.isArray(crudo)) return [];
  const salida: HorarioPlan[] = [];
  for (const h of crudo as Record<string, unknown>[]) {
    if (typeof h?.hora !== "string" || !HORA.test(h.hora)) continue;
    const conComida = CON_COMIDA.find((c) => c === h.conComida) ?? "no-importa";
    const indicacion = (typeof h.indicacion === "string" ? h.indicacion : null) as HorarioPlan["indicacion"];
    salida.push({ hora: h.hora, conComida, indicacion });
  }
  return salida.sort((a, b) => a.hora.localeCompare(b.hora));
}

export function diasDesde(crudo: unknown): DiaSemana[] {
  if (!Array.isArray(crudo)) return [];
  return DIAS_CUANDO.map((d) => d.dia).filter((d) => crudo.includes(d));
}

export type EntradaPlan = { tipo: unknown; nombreOtra?: unknown; unidadOtra?: unknown; horarios: unknown; dias: unknown; fechaFin?: unknown };
export type DatosPlan = Pick<Monitoreo, "tipo" | "nombre_otra" | "unidad_otra" | "horarios" | "dias_recurrentes" | "fecha_fin">;

export function validarPlan(entrada: EntradaPlan, hoy: string): { ok: true; datos: DatosPlan } | { ok: false; message: string } {
  if (!esTipoRegistrable(entrada.tipo)) return { ok: false, message: "Elegí qué querés medir." };
  const metrica = validarMetricaOtra(entrada.tipo, entrada.nombreOtra, entrada.unidadOtra);
  if (!metrica.ok) return metrica;
  const horarios = horariosDesde(entrada.horarios);
  if (!Array.isArray(entrada.horarios) || horarios.length !== entrada.horarios.length || horarios.length === 0) {
    return { ok: false, message: "Revisá los horarios." };
  }
  if (horarios.length > MAX_HORARIOS_PLAN) return { ok: false, message: `Podés elegir hasta ${MAX_HORARIOS_PLAN} horarios.` };
  if (new Set(horarios.map((h) => h.hora)).size !== horarios.length) return { ok: false, message: "Hay dos mediciones a la misma hora." };
  let fecha_fin: string | null = null;
  if (entrada.fechaFin) {
    fecha_fin = fechaValida(entrada.fechaFin);
    if (!fecha_fin) return { ok: false, message: "La fecha de fin no es válida." };
    if (fecha_fin < hoy) return { ok: false, message: "La fecha de fin ya pasó." };
  }
  return {
    ok: true,
    datos: {
      tipo: entrada.tipo,
      nombre_otra: metrica.nombreOtra,
      unidad_otra: metrica.unidadOtra,
      horarios,
      dias_recurrentes: diasDesde(entrada.dias),
      fecha_fin,
    },
  };
}
