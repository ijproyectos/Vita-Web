import type { Perfil } from "./tipos";

// "34 años" a partir de la fecha de nacimiento, o el rango declarado en el
// onboarding ("30-39") si no hay fecha exacta.
export function edadTexto(perfil: Pick<Perfil, "fecha_nacimiento" | "edad_rango">): string | null {
  if (perfil.fecha_nacimiento) {
    const nacimiento = new Date(perfil.fecha_nacimiento);
    const edad = Math.floor((new Date().getTime() - nacimiento.getTime()) / (365.25 * 24 * 3600 * 1000));
    return `${edad} años`;
  }
  return perfil.edad_rango;
}
