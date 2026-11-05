import type { CuidadorDePersona } from "./tipos";

// Quién gestiona a la persona que un Lector está mirando. Solo se nombra
// cuando hay EXACTAMENTE un Admin visible; con cero o varios no se adivina.
export function unicoAdmin(cuidadores: CuidadorDePersona[] | null): string | null {
  if (!cuidadores) return null;
  const admins = cuidadores.filter((c) => c.estado === "aceptado" && c.rol === "editar" && !c.esYo);
  if (admins.length !== 1) return null;
  const nombre = admins[0].nombre.trim();
  if (!nombre || nombre === "Sin nombre") return null;
  return nombre.split(/\s+/)[0];
}
