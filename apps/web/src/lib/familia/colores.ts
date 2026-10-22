import type { ColorPerfil } from "./tipos";

// Clave de paleta (perfiles.color) → clases Tailwind de los tokens
// --persona-<clave> de globals.css. Literales completos a propósito: Tailwind
// solo genera clases que encuentra escritas tal cual en el código.
export const CLASES_COLOR: Record<ColorPerfil, { solido: string; texto: string; tinta: string; fondo: string; anillo: string; borde: string }> = {
  teal: {
    solido: "bg-persona-teal",
    texto: "text-persona-teal",
    tinta: "text-persona-teal-deep",
    fondo: "bg-persona-teal-tint",
    anillo: "ring-persona-teal",
    borde: "border-persona-teal",
  },
  violeta: {
    solido: "bg-persona-violeta",
    texto: "text-persona-violeta",
    tinta: "text-persona-violeta-deep",
    fondo: "bg-persona-violeta-tint",
    anillo: "ring-persona-violeta",
    borde: "border-persona-violeta",
  },
  ambar: {
    solido: "bg-persona-ambar",
    texto: "text-persona-ambar",
    tinta: "text-persona-ambar-deep",
    fondo: "bg-persona-ambar-tint",
    anillo: "ring-persona-ambar",
    borde: "border-persona-ambar",
  },
  rosa: {
    solido: "bg-persona-rosa",
    texto: "text-persona-rosa",
    tinta: "text-persona-rosa-deep",
    fondo: "bg-persona-rosa-tint",
    anillo: "ring-persona-rosa",
    borde: "border-persona-rosa",
  },
  azul: {
    solido: "bg-persona-azul",
    texto: "text-persona-azul",
    tinta: "text-persona-azul-deep",
    fondo: "bg-persona-azul-tint",
    anillo: "ring-persona-azul",
    borde: "border-persona-azul",
  },
};

export const ETIQUETA_COLOR: Record<ColorPerfil, string> = {
  teal: "Verde agua",
  violeta: "Violeta",
  ambar: "Ámbar",
  rosa: "Rosa",
  azul: "Azul",
};

/** Color por defecto cuando el perfil no eligió uno: vos teal, el resto ciclan. */
export function colorPorDefecto(indice: number): ColorPerfil {
  const ciclo: ColorPerfil[] = ["violeta", "ambar", "rosa", "azul"];
  return ciclo[indice % ciclo.length];
}
