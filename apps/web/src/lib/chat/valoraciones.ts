// Valoración 👍/👎 de las respuestas de vita (migración 060). Puro: lo usan el cliente y la Server Action.

export const MOTIVOS_VALORACION = ["No entendió", "Respuesta incorrecta", "Muy lenta", "Otro"] as const;
export type MotivoValoracion = (typeof MOTIVOS_VALORACION)[number];
export type ValorValoracion = 1 | -1;

export function esMotivoValido(m: unknown): m is MotivoValoracion {
  return typeof m === "string" && (MOTIVOS_VALORACION as readonly string[]).includes(m);
}

/** Sin la migración 060 la tabla no existe: se esconde la función en vez de mostrar un error. */
export function faltaTablaValoraciones(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /chat_valoraciones/.test(msg) && /does not exist|schema cache/.test(msg);
}
