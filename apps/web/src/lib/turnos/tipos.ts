export type Turno = {
  id: string;
  usuario_id: string;
  especialidad: string;
  profesional: string | null;
  lugar: string | null;
  fecha: string; // "YYYY-MM-DD"
  hora: string; // "HH:MM"
  motivo: string | null;
  recordatorio: string | null;
  acompanado: boolean;
  notas: string | null;
  created_at: string;
  // Migración 023 (puede faltar mientras no esté aplicada: la lectura es `select *`).
  direccion?: string | null;
  telefono?: string | null;
  llevar?: ItemLlevar[] | null;
};

/** Ítem del checklist "Qué llevar" (`turnos.llevar`, jsonb). */
export type ItemLlevar = { t: string; ok: boolean };

export const MAX_ITEMS_LLEVAR = 30;

/** Normaliza lo que venga del jsonb (o de un cliente) a una lista válida de ítems. */
export function normalizarLlevar(crudo: unknown): ItemLlevar[] {
  if (!Array.isArray(crudo)) return [];
  const items: ItemLlevar[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== "object") continue;
    const t = typeof (x as { t?: unknown }).t === "string" ? (x as { t: string }).t.trim().slice(0, 80) : "";
    if (!t) continue;
    items.push({ t, ok: (x as { ok?: unknown }).ok === true });
    if (items.length >= MAX_ITEMS_LLEVAR) break;
  }
  return items;
}

export type DatosNuevoTurno = {
  especialidad: string;
  profesional?: string | null;
  lugar?: string | null;
  fecha: string;
  hora: string;
  motivo?: string | null;
  recordatorio?: string | null;
  acompanado?: boolean;
  notas?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  llevar?: ItemLlevar[];
};

/** Valida un teléfono opcional: vacío es válido; si no, al menos 6 dígitos. Devuelve el texto limpio o el error. */
export function validarTelefono(v: string): { ok: true; valor: string | null } | { ok: false; message: string } {
  const t = v.trim().slice(0, 40);
  if (!t) return { ok: true, valor: null };
  if (!/^[\d\s+().-]+$/.test(t) || t.replace(/\D/g, "").length < 6) {
    return { ok: false, message: "Revisá el teléfono: parece incompleto." };
  }
  return { ok: true, valor: t };
}

/** Campos editables de un turno existente (todos opcionales: solo se escribe lo que viene). */
export type DatosActualizarTurno = Partial<DatosNuevoTurno>;

export const ESPECIALIDADES_SUGERIDAS = [
  "Clínica",
  "Cardiología",
  "Gastroenterología",
  "Ginecología",
  "Endocrinología",
  "Laboratorio",
  "Imágenes",
  "Otro",
] as const;

/** Especialidades del alta de turno (V7 `specOptions`); "Otra" abre un campo libre. */
export const ESPECIALIDADES_ALTA = ["Cardiología", "Clínica", "Laboratorio", "Odontología", "Kinesiología"] as const;

/** Sugerencias de "Qué hay que llevar" por especialidad (V7 `SUG`). */
export const SUGERENCIAS_LLEVAR: Record<string, string[]> = {
  "Cardiología": ["El electro anterior", "Últimos análisis"],
  "Clínica": ["Últimos análisis"],
  "Laboratorio": ["La orden del laboratorio"],
  "Odontología": ["Radiografías anteriores"],
  "Kinesiología": ["La orden de kinesiología", "Ropa cómoda"],
};

/** Ítems base del checklist: [texto, etiqueta, activo por defecto]. */
export const BASE_LLEVAR: [string, string, boolean][] = [
  ["DNI", "Siempre", true],
  ["Credencial de PAMI", "Opcional", true],
  ["Credencial de obra social", "Opcional", false],
];
