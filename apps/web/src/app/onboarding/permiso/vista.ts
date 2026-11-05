import type { EstadoPush } from "@/components/vita/activar-notificaciones";

export const NOTA_AVISOS_NO_ACTIVADOS = "No se activaron los avisos. Podés hacerlo después desde tu inicio.";

export type AccionPermiso = "permitir" | "continuar" | "continuar-sin-avisos";

/**
 * Qué se ofrece en el paso de permiso. Quien llega desde una invitación no
 * tiene "Ahora no": si ya intentó activar y los avisos siguen apagados, en vez
 * de repetir el botón se le deja seguir con una nota.
 */
export function accionPermiso(estado: EstadoPush, intentado: boolean, sinAhoraNo: boolean): AccionPermiso {
  if (estado !== "inactivo" && estado !== "cargando") return "continuar";
  if (sinAhoraNo && intentado && estado === "inactivo") return "continuar-sin-avisos";
  return "permitir";
}
