export type MomentoDia = "mañana" | "mediodia" | "tarde" | "noche";

export type ConComida = "antes" | "con" | "despues" | "no-importa";

export type DiaSemana =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export const DIAS_SEMANA: DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

export type Medicamento = {
  id: string;
  usuario_id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  hora_programada: string;
  momento_dia: MomentoDia;
  condicion: string | null;
  dias_recurrentes: DiaSemana[];
  frecuencia: string | null;
  con_comida: ConComida;
  duracion: string | null;
  notas: string | null;
  // Stock compartido entre todas las filas del mismo medicamento (migración
  // 014, lib/inventario). null = sin control de pastillas.
  inventario_id: string | null;
  created_at: string;
  updated_at: string;
  // Migración 023 (pueden faltar mientras no esté aplicada).
  indicado_por?: string | null;
  fecha_inicio?: string | null;
};

/** Una toma registrada (fila de `medicamentos_tomas`) para el historial y la semana del detalle. */
export type TomaRegistrada = {
  medicamento_id: string;
  /** "YYYY-MM-DD", en UTC (mismo criterio que `listarHoy`). */
  fecha: string;
  tomado: boolean;
  tomado_en: string | null;
};

export type MedicamentoConToma = Medicamento & {
  tomado: boolean;
  toma_id: string | null;
};

export type DatosNuevoMedicamento = {
  nombre: string;
  dosis?: string | null;
  unidad?: string;
  horaProgramada: string;
  momentoDia: MomentoDia;
  condicion?: string | null;
  diasRecurrentes?: DiaSemana[];
  frecuencia?: string | null;
  conComida?: ConComida;
  duracion?: string | null;
  notas?: string | null;
};

// Hora default por momento — usada por el form nuevo (AgregarMedicamentoScreen
// del diseño) para crear una fila por cada momento elegido sin pedir un
// horario puntual por cada uno.
export const HORA_POR_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "08:00",
  mediodia: "13:00",
  tarde: "18:00",
  noche: "22:00",
};

// Datos comunes a todas las filas cuando se crea un medicamento aplicable a
// varios momentos del día a la vez (una fila por momento, mismo patrón que
// ya usa la app: una fila = un horario puntual).
export type DatosNuevoMedicamentoMultiMomento = {
  nombre: string;
  dosis?: string | null;
  unidad?: string;
  /** Alta por momento (chat, onboarding): una fila por momento, hora por defecto. */
  momentos?: MomentoDia[];
  /** Alta por toma (formulario V7): una fila por toma, con su hora y su relación con la comida. */
  tomas?: { hora: string; conComida: ConComida }[];
  frecuencia?: string | null;
  conComida?: ConComida;
  duracion?: string | null;
  notas?: string | null;
};

export type DatosActualizarHorario = {
  horaProgramada?: string;
  momentoDia?: MomentoDia;
  diasRecurrentes?: DiaSemana[];
};

export type EstadisticaAdherencia = {
  medicamentoId: string;
  nombre: string;
  tomados: number;
  esperados: number;
  porcentaje: number;
};

export type ResumenAdherencia = {
  porcentaje: number;
  rachaDias: number;
  medicamentos: EstadisticaAdherencia[];
};

/**
 * "500 mg" a partir de `dosis` + `unidad`. Algunas filas (chat, onboarding)
 * ya guardan la unidad dentro de `dosis` ("500mg"): en ese caso no se repite.
 */
export function textoDosis(m: Pick<Medicamento, "dosis" | "unidad">): string {
  const dosis = m.dosis?.trim();
  if (!dosis) return "";
  return /[a-zA-Z]/.test(dosis) ? dosis : `${dosis} ${m.unidad}`.trim();
}

const COMIDA_POR_MOMENTO: Record<MomentoDia, { con: string; antes: string; despues: string }> = {
  "mañana": { con: "Con el desayuno", antes: "Antes del desayuno", despues: "Después del desayuno" },
  mediodia: { con: "Con el almuerzo", antes: "Antes del almuerzo", despues: "Después del almuerzo" },
  tarde: { con: "Con la merienda", antes: "Antes de la merienda", despues: "Después de la merienda" },
  noche: { con: "Con la cena", antes: "Antes de la cena", despues: "Después de la cena" },
};

/** Línea de "Indicación" del detalle: "Con el desayuno"; null si no hay indicación de comida. */
export function indicacionDeComida(m: Pick<Medicamento, "con_comida" | "momento_dia">): string | null {
  if (m.con_comida === "no-importa") return null;
  return COMIDA_POR_MOMENTO[m.momento_dia]?.[m.con_comida] ?? null;
}

/**
 * Un medicamento tal como lo ve "Mis medicamentos": todas las filas
 * (horarios) del mismo medicamento juntas. Se agrupan por stock compartido
 * (`inventario_id`) y, si no tienen, por nombre+dosis normalizados — la misma
 * identidad que usa el inventario (`claveMedicamento`).
 */
export type GrupoMedicamentoLista = {
  /** Id de la primera toma del día: identifica el grupo en `?editar=<id>`. */
  id: string;
  nombre: string;
  /** Filas del grupo ordenadas por hora. */
  filas: Medicamento[];
};

export function agruparMedicamentos(meds: Medicamento[]): GrupoMedicamentoLista[] {
  const porClave = new Map<string, Medicamento[]>();
  for (const m of meds) {
    const clave = m.inventario_id
      ? `inv:${m.inventario_id}`
      : `${m.nombre.trim().toLowerCase()}|${(m.dosis ?? "").trim().toLowerCase()}`;
    const lista = porClave.get(clave) ?? [];
    lista.push(m);
    porClave.set(clave, lista);
  }
  return [...porClave.values()]
    .map((filas) => {
      const ordenadas = [...filas].sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
      return { id: ordenadas[0].id, nombre: ordenadas[0].nombre, filas: ordenadas };
    })
    .sort((a, b) => a.filas[0].hora_programada.localeCompare(b.filas[0].hora_programada) || a.nombre.localeCompare(b.nombre));
}

/** Una toma del formulario de edición: `id` presente = fila existente; ausente = toma nueva. */
export type TomaEditada = { id?: string; hora: string; conComida: ConComida };

export type DatosActualizarGrupo = {
  nombre: string;
  dosis: string | null;
  unidad: string;
  /** undefined = no tocar la frecuencia descriptiva. */
  frecuencia?: string | null;
  tomas: TomaEditada[];
};
