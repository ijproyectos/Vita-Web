// Lógica pura para decidir si hay que avisar de una versión nueva.

export type EstadoAviso = {
  /** Build con el que se renderizó esta pestaña. */
  buildActual: string;
  /** Build que reporta el servidor, o null si no se pudo consultar. */
  buildServidor: string | null;
  /** Build cuyo aviso ya se descartó en esta sesión. */
  descartado: string | null;
  enLinea: boolean;
  visible: boolean;
};

/** true si hay que mostrar el aviso de "versión nueva". */
export function hayVersionNueva(e: EstadoAviso): boolean {
  if (!e.enLinea || !e.visible) return false;
  if (!e.buildServidor) return false;
  // Sin SHA real (local) no se puede comparar: no se molesta.
  if (e.buildActual === "dev" || e.buildServidor === "dev") return false;
  if (e.buildServidor === e.buildActual) return false;
  return e.buildServidor !== e.descartado;
}

/** Valida el JSON de /api/version; devuelve el build o null. */
export function buildDeRespuesta(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const b = (json as { build?: unknown }).build;
  return typeof b === "string" && b.length > 0 && b.length <= 64 ? b : null;
}
