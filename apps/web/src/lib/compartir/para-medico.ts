// Resumen de salud para el médico, armado desde filas leídas con la sesión.
// PURO: lo usa el PDF de "Para tu médico". El link público (/p/[token]) sale
// de la RPC `resumen_profesional` (056); este módulo copia sus reglas para que
// el PDF y el link muestren lo mismo. Si cambia una, cambiar la otra.
import type { ResumenProfesional } from "./tipos";

export const DIAS_CUMPLIMIENTO = 14;
const MAX_ESTUDIOS = 5;
// Igual que `dias_recurrentes` (sin tildes). getUTCDay: 0 = domingo.
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

export type PerfilParaMedico = {
  nombre?: string | null;
  fecha_nacimiento?: string | null;
  edad_rango?: string | null;
  genero?: string | null;
  grupo_sanguineo?: string | null;
  altura_cm?: number | null;
  peso_kg?: number | null;
  obra_social?: string | null;
  condiciones?: { label: string; tipo: string; desde: string }[] | null;
  alergias?: string[] | null;
  contacto_emergencia_nombre?: string | null;
  contacto_emergencia_telefono?: string | null;
};

export type MedicamentoParaMedico = {
  nombre: string;
  droga?: string | null;
  dosis: string | null;
  unidad?: string | null;
  hora_programada: string;
  momento_dia: string;
  dias_recurrentes?: string[] | null;
  con_comida?: string | null;
  frecuencia?: string | null;
  duracion?: string | null;
  condicion?: string | null;
  notas?: string | null;
  forma?: string | null;
  fecha_fin?: string | null;
  inventario_id?: string | null;
  /** Fecha AR de alta "YYYY-MM-DD" (desde `created_at`). */
  alta: string;
};

export type EstudioParaMedico = {
  tipo: string | null;
  fecha: string | null;
  resumen: string | null;
  valores: unknown;
  estado: string;
  created_at: string;
};

/** "YYYY-MM-DD" menos n días, sin pasar por la zona horaria. */
export function restarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function edadEnAnios(nacimiento: string, hoy: string): number | null {
  const [an, mn, dn] = nacimiento.slice(0, 10).split("-").map(Number);
  const [ah, mh, dh] = hoy.split("-").map(Number);
  if (!an || !mn || !dn) return null;
  return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0);
}

function vigente(m: MedicamentoParaMedico, dia: string): boolean {
  return !m.fecha_fin || dia <= m.fecha_fin.slice(0, 10);
}

function aplicaElDia(m: MedicamentoParaMedico, dia: string): boolean {
  const dias = m.dias_recurrentes ?? [];
  if (dias.length === 0) return true;
  return dias.includes(DIAS_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]);
}

function valoresDeEstudio(v: unknown): { nombre: string; valor: string }[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is { nombre: string; valor: string } => !!x && typeof x.nombre === "string" && typeof x.valor === "string"
  );
}

export function armarResumenParaMedico(args: {
  perfil: PerfilParaMedico | null;
  medicamentos: MedicamentoParaMedico[];
  stockPorInventario: Map<string, number>;
  /** Fechas AR de las tomas marcadas como tomadas en los últimos 14 días. */
  tomadas: string[];
  estudios: EstudioParaMedico[];
  hoy: string;
  generadoEn: string;
}): ResumenProfesional {
  const { perfil: p, hoy } = args;
  const edad = p?.fecha_nacimiento ? edadEnAnios(p.fecha_nacimiento, hoy) : null;

  const medicamentos = args.medicamentos
    .filter((m) => vigente(m, hoy))
    .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada) || a.nombre.localeCompare(b.nombre))
    .map((m) => ({
      nombre: m.nombre,
      droga: m.droga ?? null,
      dosis: m.dosis,
      unidad: m.unidad ?? "",
      hora: m.hora_programada.slice(0, 5),
      momento: m.momento_dia as ResumenProfesional["medicamentos"][number]["momento"],
      dias: m.dias_recurrentes ?? [],
      con_comida: m.con_comida ?? "",
      frecuencia: m.frecuencia ?? null,
      duracion: m.duracion ?? null,
      condicion: m.condicion ?? null,
      notas: m.notas ?? null,
      forma: m.forma ?? null,
      pastillas_restantes: m.inventario_id ? (args.stockPorInventario.get(m.inventario_id) ?? null) : null,
    }));

  const tomadasPorDia = new Map<string, number>();
  for (const f of args.tomadas) tomadasPorDia.set(f, (tomadasPorDia.get(f) ?? 0) + 1);
  const porDia = Array.from({ length: DIAS_CUMPLIMIENTO }, (_, i) => restarDias(hoy, DIAS_CUMPLIMIENTO - 1 - i)).map((fecha) => {
    const programadas = args.medicamentos.filter((m) => m.alta <= fecha && vigente(m, fecha) && aplicaElDia(m, fecha)).length;
    return { fecha, programadas, tomadas: Math.min(tomadasPorDia.get(fecha) ?? 0, programadas) };
  });
  const programadas = porDia.reduce((s, d) => s + d.programadas, 0);
  const tomadas = porDia.reduce((s, d) => s + d.tomadas, 0);

  const estudios = args.estudios
    .filter((e) => e.estado === "listo")
    .sort((a, b) => {
      if (a.fecha !== b.fecha) {
        if (!a.fecha) return 1;
        if (!b.fecha) return -1;
        return b.fecha.localeCompare(a.fecha);
      }
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, MAX_ESTUDIOS)
    .map((e) => ({ tipo: e.tipo, fecha: e.fecha, resumen: e.resumen, valores: valoresDeEstudio(e.valores) }));

  return {
    generado_en: args.generadoEn,
    vigente_hasta: args.generadoEn,
    paciente: {
      nombre: p?.nombre?.trim().split(" ")[0] || null,
      edad,
      edad_rango: edad == null ? (p?.edad_rango ?? null) : null,
      genero: p?.genero ?? null,
      grupo_sanguineo: p?.grupo_sanguineo ?? null,
      altura_cm: p?.altura_cm ?? null,
      peso_kg: p?.peso_kg ?? null,
      obra_social: p?.obra_social ?? null,
    },
    condiciones: p?.condiciones ?? [],
    alergias: p?.alergias ?? [],
    medicamentos,
    adherencia: {
      dias: DIAS_CUMPLIMIENTO,
      programadas,
      tomadas,
      porcentaje: programadas === 0 ? null : Math.round((100 * tomadas) / programadas),
      por_dia: porDia,
    },
    // El médico no ve los turnos (decisión del usuario 2026-11-11).
    turnos: [],
    estudios,
    contacto_emergencia: { nombre: p?.contacto_emergencia_nombre ?? null, telefono: p?.contacto_emergencia_telefono ?? null },
  };
}
