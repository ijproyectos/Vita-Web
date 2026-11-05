import type { EstadoPush } from "@/components/vita/activar-notificaciones";

/** Con invitación, espera máxima a que se resuelva el estado inicial. */
export const ESPERA_PERMISO_MS = 8000;
/** Con invitación, espera máxima de la pregunta del sistema antes de seguir igual. */
export const ESPERA_INTENTO_MS = 20000;

export type AccionPermiso = "permitir" | "continuar";

/**
 * Qué botón se ofrece. "Permitir avisos" mientras el sistema pueda preguntar;
 * "Continuar" si no puede (iPhone sin instalar, navegador sin avisos, ya
 * bloqueados o ya activos). Con invitación, también si la carga inicial no
 * resuelve (`cargaTrabada`), porque el botón de permitir sigue deshabilitado.
 */
export function accionPermiso(estado: EstadoPush, sinAhoraNo: boolean, cargaTrabada = false): AccionPermiso {
  if (estado === "inactivo") return "permitir";
  if (estado === "cargando") return sinAhoraNo && cargaTrabada ? "continuar" : "permitir";
  return "continuar";
}

/**
 * Pide el permiso y sigue el flujo, responda lo que responda la persona. Si el
 * sistema no contesta en `esperaMs`, sigue igual. `activar` se llama de forma
 * síncrona: el pedido de permiso tiene que correr dentro del toque.
 */
export async function pedirPermisoYSeguir(activar: () => Promise<void>, seguir: () => void, esperaMs = ESPERA_INTENTO_MS): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const espera = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, esperaMs);
  });
  const intento = activar().catch(() => undefined);
  await Promise.race([intento, espera]);
  clearTimeout(temporizador);
  seguir();
}
