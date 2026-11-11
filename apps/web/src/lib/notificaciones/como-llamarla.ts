// Cómo nombra un aviso a la persona cuidada, para CADA cuidador (diseño "Vita
// Lista de Avisos": "Mamá no confirmó su Glucophage", "Hoy mamá tomó 4 de 5").
// La relación es la que cargó ese cuidador en su vínculo ("¿Qué es tuyo?").
// Solo se usa cuando es clara; si no hay, o es "Otro", "Hijo/a", "Pareja",
// "Abuela/o"…, va el primer nombre. PURO.

const RELACIONES_CLARAS: Record<string, string> = {
  mamá: "mamá",
  mama: "mamá",
  papá: "papá",
  papa: "papá",
  abuela: "abuela",
  abuelo: "abuelo",
};

export type ComoLlamarla = {
  /** Al empezar la frase: "Mamá" / "Elsa". */
  inicio: string;
  /** En medio de la frase: "mamá" / "Elsa". */
  medio: string;
};

export function comoLlamarla(nombre: string | null | undefined, relacion?: string | null): ComoLlamarla {
  const clara = relacion ? RELACIONES_CLARAS[relacion.trim().toLowerCase()] : undefined;
  if (clara) return { inicio: clara.charAt(0).toUpperCase() + clara.slice(1), medio: clara };
  const primero = nombre?.trim().split(/\s+/)[0] || "Tu familiar";
  return { inicio: primero, medio: primero === "Tu familiar" ? "tu familiar" : primero };
}
