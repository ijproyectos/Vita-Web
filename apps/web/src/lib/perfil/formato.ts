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

// Particles that stay lowercase inside a name ("María de los Ángeles").
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);

// "jonatan rios" → "Jonatan Rios". Only uppercases the first letter of each
// word (except particles after the first word); the rest is left as typed.
export function nombreConMayuscula(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .map((palabra, i) =>
      i > 0 && PARTICULAS.has(palabra.toLowerCase())
        ? palabra
        : palabra.charAt(0).toLocaleUpperCase("es-AR") + palabra.slice(1)
    )
    .join(" ");
}
