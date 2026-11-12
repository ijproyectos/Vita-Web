import type { Perfil } from "./tipos";
import { edadDesdeFecha } from "@/lib/onboarding/nacimiento";
import { fechaISOEnAR } from "@/lib/rutina/formato";

// "34 años" a partir de la fecha de nacimiento, o el rango declarado en el
// onboarding ("30-39") si no hay fecha exacta.
export function edadTexto(perfil: Pick<Perfil, "fecha_nacimiento" | "edad_rango">): string | null {
  if (perfil.fecha_nacimiento) {
    return `${edadDesdeFecha(perfil.fecha_nacimiento.slice(0, 10), fechaISOEnAR())} años`;
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

// "Por ahora sos la única…" del diseño, según el género cargado en el perfil
// de quien mira. Sin género (o uno que no es femenino/masculino), neutro.
export function frasePorAhoraSoloVos(genero: string | null | undefined): string {
  const sujeto = genero === "Femenino" ? "sos la única" : genero === "Masculino" ? "sos el único" : "solo estás vos";
  return `Por ahora ${sujeto}. Invitá a alguien para que también reciba los avisos.`;
}
