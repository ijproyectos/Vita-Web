export type TipoCondicion = "permanente" | "temporal";

export type Condicion = {
  label: string;
  tipo: TipoCondicion;
  desde: string; // texto libre, ej. "2022" o "Mar 2026"
};

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
  onboarding_completado_at: string | null;
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
  >
>;

// Paleta de chips que se ciclan de forma determinística por índice — el
// diseño no deja elegir color, lo asigna implícitamente.
export const PALETA_CHIPS = ["teal", "violet", "amber", "rose"] as const;
export type ColorChip = (typeof PALETA_CHIPS)[number];

export function colorChipPorIndice(indice: number): ColorChip {
  return PALETA_CHIPS[indice % PALETA_CHIPS.length];
}
