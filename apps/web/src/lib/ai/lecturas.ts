// Formato de las tools de LECTURA del chat (turnos próximos, stock, mediciones,
// estudios, adherencia): de los datos del dominio a lo que recibe el modelo.
// Puro (sin I/O): lo usa tools.ts y se testea solo. Todo texto que escribió una
// persona (o que salió de un archivo, como un estudio) pasa por limpiarDato: un
// resultado de tool es DATO, nunca una instrucción.
import { limpiarDato } from "@/lib/ai/limpiar";
import { cantidadStock, esForma } from "@/lib/medicamentos/forma";
import type { ResumenAdherencia } from "@/lib/medicamentos/tipos";
import { ETIQUETA_CONTEXTO, formatearValor, metaDe, type Medicion } from "@/lib/mediciones/tipos";
import type { Monitoreo } from "@/lib/mediciones/plan";
import type { Estudio } from "@/lib/estudios/tipos";
import type { Turno } from "@/lib/turnos/tipos";

/** Número entero dentro de [min, max]; si no vino o no es válido, el por defecto. */
export function acotarLimite(valor: unknown, porDefecto: number, min: number, max: number): number {
  const n = typeof valor === "number" && Number.isFinite(valor) ? Math.trunc(valor) : porDefecto;
  return Math.min(max, Math.max(min, n));
}

const texto = (v: string | null | undefined, max = 60) => (v?.trim() ? limpiarDato(v, max) : null);

export function turnoParaModelo(t: Turno) {
  return {
    id: t.id,
    date: t.fecha,
    time: t.hora.slice(0, 5),
    specialty: limpiarDato(t.especialidad),
    professional: texto(t.profesional),
    place: texto([t.lugar, t.direccion].filter((x) => x?.trim()).join(", "), 80),
    with_company: t.acompanado,
    notes: texto(t.notas, 80),
    to_bring: (t.llevar ?? []).map((i) => ({ item: limpiarDato(i.t), ready: i.ok })),
  };
}

export type StockParaModelo = {
  name: string;
  dose: string | null;
  left: string;
  days_left: number | null;
  running_low: boolean;
};

export function stockParaModelo(g: {
  nombre: string;
  dosis: string | null;
  forma?: unknown;
  inventario: { stock: number; umbral_alerta: number } | null;
  dias: number | null;
}): StockParaModelo | null {
  if (!g.inventario) return null;
  const forma = esForma(g.forma) ? g.forma : "pastilla";
  return {
    name: limpiarDato(g.nombre),
    dose: texto(g.dosis, 20),
    left: cantidadStock(forma, g.inventario.stock),
    days_left: g.dias,
    running_low: g.inventario.stock < g.inventario.umbral_alerta || (g.dias !== null && g.dias <= 5),
  };
}

export function medicionParaModelo(m: Medicion) {
  const meta = metaDe(m);
  return {
    type: m.tipo,
    name: limpiarDato(meta.nombre),
    value: `${formatearValor(m)}${meta.unidad ? ` ${limpiarDato(meta.unidad, 12)}` : ""}`,
    pulse: m.pulso,
    context: m.contexto ? ETIQUETA_CONTEXTO[m.contexto] : null,
    measured_at: m.medido_at,
    notes: texto(m.notas, 80),
  };
}

export function monitoreoParaModelo(p: Monitoreo) {
  return {
    type: p.tipo,
    name: limpiarDato(metaDe(p).nombre),
    times: p.horarios.map((h) => h.hora),
    days: p.dias_recurrentes.length ? p.dias_recurrentes : "todos los días",
    until: p.fecha_fin,
  };
}

export function estudioParaModelo(e: Pick<Estudio, "tipo" | "fecha" | "resumen" | "valores" | "estado" | "lugar">) {
  return {
    type: texto(e.tipo),
    date: e.fecha,
    place: texto(e.lugar),
    read_ok: e.estado === "listo",
    summary: texto(e.resumen, 300),
    values: e.valores.slice(0, 30).map((v) => ({
      name: limpiarDato(v.nombre),
      value: limpiarDato(v.valor, 20),
      unit: texto(v.unidad, 15),
      printed_range: texto(v.rango_texto, 40) ?? (v.rango_min != null || v.rango_max != null ? `${v.rango_min ?? ""}–${v.rango_max ?? ""}` : null),
      status: v.estado ?? null,
    })),
  };
}

export function adherenciaParaModelo(r: ResumenAdherencia, dias: number) {
  return {
    days: dias,
    percent: r.porcentaje,
    streak_days: r.rachaDias,
    by_medication: r.medicamentos.map((m) => ({ name: limpiarDato(m.nombre), taken: m.tomados, expected: m.esperados, percent: m.porcentaje })),
  };
}
