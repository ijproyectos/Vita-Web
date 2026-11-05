import type { EstadoPush } from "@/components/vita/activar-notificaciones";

export const NOTA_AVISOS_NO_ACTIVADOS = "No se activaron los avisos. Podés hacerlo después desde tu inicio.";

/** Con invitación, espera máxima a que se resuelva el estado inicial. */
export const ESPERA_PERMISO_MS = 8000;
/** Con invitación, espera máxima de un intento: incluye el diálogo del navegador abierto, que lleva su tiempo leer. */
export const ESPERA_INTENTO_MS = 20000;

export type AccionPermiso = "permitir" | "continuar" | "continuar-sin-avisos";

/**
 * Qué se ofrece en el paso de permiso. Quien llega desde una invitación no
 * tiene "Ahora no": si ya intentó activar y los avisos siguen apagados, en vez
 * de repetir el botón se le deja seguir con una nota. Lo mismo si venció la
 * espera (`trabado`) con el estado sin resolver o un intento sin terminar
 * (`enCurso`). Quien solo está leyendo la pantalla sigue viendo "Permitir avisos".
 */
export function accionPermiso(estado: EstadoPush, intentado: boolean, sinAhoraNo: boolean, trabado = false, enCurso = false): AccionPermiso {
  if (estado !== "inactivo" && estado !== "cargando") return "continuar";
  // Sin respuesta por demasiado tiempo: no se queda sin salida.
  if (sinAhoraNo && trabado && (estado === "cargando" || enCurso)) return "continuar-sin-avisos";
  if (sinAhoraNo && intentado && estado === "inactivo") return "continuar-sin-avisos";
  return "permitir";
}
