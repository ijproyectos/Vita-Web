// Ícono y tono por especialidad — compartido por Home, Rutina, la lista de
// turnos y el form de alta. Los íconos son claves de lib/vita-icons.tsx.
export const ICONO_ESPECIALIDAD: Record<string, string> = {
  "Clínica": "stethoscope",
  "Cardiología": "heart",
  "Gastroenterología": "pill",
  "Ginecología": "heart-plus",
  "Endocrinología": "flame",
  "Laboratorio": "activity",
  "Imágenes": "camera",
  "Odontología": "tooth",
  "Kinesiología": "bone",
  "Traumatología": "bone",
  Otro: "plus",
};

export function iconoDeEspecialidad(especialidad: string): string {
  return ICONO_ESPECIALIDAD[especialidad] ?? "stethoscope";
}

// Tono del borde izquierdo / ícono de la tarjeta (tokens de globals.css).
// Cardiología en rojo, el resto rota por índice entre teal, violeta y ámbar.
const ROTACION = ["var(--persona-1)", "var(--persona-2)", "var(--persona-3)"];

export function tonoDeTurno(especialidad: string, indice: number): string {
  if (especialidad === "Cardiología") return "var(--destructive)";
  return ROTACION[indice % ROTACION.length];
}
