import type { EstadoPush } from "@/components/vita/activar-notificaciones";

export const NOTA_AVISOS_NO_ACTIVADOS = "No se activaron los avisos. Podés hacerlo después desde tu inicio.";

/** Segundos sin poder avanzar tras los que, con invitación, se deja continuar. */
export const ESPERA_PERMISO_MS = 8000;

export type AccionPermiso = "permitir" | "continuar" | "continuar-sin-avisos";

/**
 * Qué se ofrece en el paso de permiso. Quien llega desde una invitación no
 * tiene "Ahora no": si ya intentó activar y los avisos siguen apagados, en vez
 * de repetir el botón se le deja seguir con una nota. Lo mismo si lleva
 * demasiado esperando (`trabado`) y el estado no se resolvió a "activo".
 */
export function accionPermiso(estado: EstadoPush, intentado: boolean, sinAhoraNo: boolean, trabado = false): AccionPermiso {
  if (estado !== "inactivo" && estado !== "cargando") return "continuar";
  // Sin respuesta por demasiado tiempo (estado que no resuelve o intento sin terminar): no se queda sin salida.
  if (sinAhoraNo && trabado) return "continuar-sin-avisos";
  if (sinAhoraNo && intentado && estado === "inactivo") return "continuar-sin-avisos";
  return "permitir";
}
