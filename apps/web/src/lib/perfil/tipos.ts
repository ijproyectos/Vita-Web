// Respuesta al paso "¿para quién vas a usar la app?" del onboarding
// (app/onboarding/para-quien/) — se pregunta una sola vez, gateada por
// esta misma columna, no por onboarding_completado_at (ver migración 010).
export type UsoApp = "yo" | "cuido" | "ambos";

// Respuesta a "¿te medís la presión o el azúcar en casa?" (031_mediciones_en_casa.sql).
export const MEDICIONES_EN_CASA = ["presion", "glucemia", "ambas", "ninguna"] as const;
export type MedicionesEnCasa = (typeof MEDICIONES_EN_CASA)[number];

export type TipoCondicion = "permanente" | "temporal";

export type Condicion = {
  label: string;
  tipo: TipoCondicion;
  desde: string; // texto libre, ej. "2022" o "Mar 2026"
  // Texto libre que reemplaza a "tipo · desde" cuando lo escrito en "Detalle"
  // no se pudo interpretar (Condiciones y alergias). Sin migración: es jsonb.
  detalle?: string;
};

/** "Permanente · desde 2021" (o el `detalle` libre, si lo hay). */
export function metaDeCondicion(c: Condicion): string {
  if (c.detalle?.trim()) return c.detalle.trim();
  const tipo = c.tipo === "temporal" ? "Temporal" : "Permanente";
  return c.desde?.trim() ? `${tipo} · desde ${c.desde.trim()}` : tipo;
}

/**
 * Inverso de `metaDeCondicion`: interpreta "Temporal · desde Mar 2026". Si no
 * respeta ese formato, queda como `detalle` libre y tipo/desde no cambian.
 */
export function condicionDesdeDetalle(texto: string, actual: Pick<Condicion, "tipo" | "desde">): Pick<Condicion, "tipo" | "desde" | "detalle"> {
  const t = texto.trim();
  const m = t.match(/^(permanente|temporal)(?:\s*[·\-–]\s*desde\s+(.+))?$/i);
  if (m) return { tipo: m[1].toLowerCase() === "temporal" ? "temporal" : "permanente", desde: (m[2] ?? "").trim(), detalle: undefined };
  return { tipo: actual.tipo, desde: actual.desde, detalle: t || undefined };
}

export type Perfil = {
  id: string;
  nombre: string | null;
  avatar_url: string | null;
  created_at: string;
  fecha_nacimiento: string | null;
  edad_rango: string | null;
  genero: string | null;
  grupo_sanguineo: string | null;
  altura_cm: number | null;
  peso_kg: number | null;
  condiciones: Condicion[];
  alergias: string[];
  obra_social: string | null;
  numero_afiliado: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  // 025_perfil_campos.sql: ausentes (undefined) mientras la migración no esté
  // aplicada; la UI usa `COLUMNAS_025.every((c) => c in perfil)` para saberlo.
  apellido?: string | null;
  telefono?: string | null;
  contacto_emergencia_relacion?: string | null;
  onboarding_completado_at: string | null;
  uso_app: UsoApp | null;
  // Clave de paleta (021_familia.sql); ver lib/familia/tipos.ts.
  color: string | null;
  // 031_mediciones_en_casa.sql: ausente (undefined) mientras la migración no
  // esté aplicada; null = no respondió.
  mediciones_en_casa?: MedicionesEnCasa | null;
};

// Subconjunto de campos editables inline desde Resumen de salud.
export type CambiosPerfil = Partial<
  Pick<
    Perfil,
    | "nombre"
    | "fecha_nacimiento"
    | "genero"
    | "grupo_sanguineo"
    | "altura_cm"
    | "peso_kg"
    | "obra_social"
    | "numero_afiliado"
    | "contacto_emergencia_nombre"
    | "contacto_emergencia_telefono"
    | "contacto_emergencia_relacion"
    | "apellido"
    | "telefono"
    | "color"
    | "mediciones_en_casa"
  >
>;

/** Columnas de la migración 025: si faltan, la UI las oculta y el guardado las omite. */
export const COLUMNAS_025 = ["apellido", "telefono", "contacto_emergencia_relacion"] as const;

/** Nombre y apellido juntos ("Mica Rodríguez"); sin apellido, solo el nombre. */
export function nombreCompleto(p: Pick<Perfil, "nombre"> & { apellido?: string | null }): string {
  return [p.nombre?.trim(), p.apellido?.trim()].filter(Boolean).join(" ");
}

// Paleta de chips que se ciclan de forma determinística por índice — el
// diseño no deja elegir color, lo asigna implícitamente.
export const PALETA_CHIPS = ["teal", "violet", "amber", "rose"] as const;
export type ColorChip = (typeof PALETA_CHIPS)[number];

export function colorChipPorIndice(indice: number): ColorChip {
  return PALETA_CHIPS[indice % PALETA_CHIPS.length];
}
