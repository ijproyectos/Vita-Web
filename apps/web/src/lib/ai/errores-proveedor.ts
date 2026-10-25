import Anthropic from "@anthropic-ai/sdk";

// Clasificación de las fallas de Anthropic para mostrarle algo claro al usuario. Sin `server-only` ni
// I/O para poder testearla cuando haya runner. Usa las clases tipadas del SDK (no el texto del mensaje).

export type ClaseErrorProveedor = "limite" | "sobrecarga" | "servidor" | "timeout" | "conexion" | "otro";

export function clasificarErrorProveedor(e: unknown): ClaseErrorProveedor {
  // Orden importa: APIConnectionTimeoutError es subclase de APIConnectionError.
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (e instanceof Anthropic.APIConnectionError) return "conexion";
  if (e instanceof Anthropic.RateLimitError) return "limite"; // 429
  if (e instanceof Anthropic.APIError) {
    if (e.status === 529) return "sobrecarga"; // overloaded_error (el SDK lo trata como InternalServerError)
    if (typeof e.status === "number" && e.status >= 500) return "servidor";
  }
  return "otro";
}

const MENSAJES: Record<ClaseErrorProveedor, string> = {
  limite: "vita está con mucha demanda. Probá de nuevo en un minuto.",
  sobrecarga: "vita está con mucha demanda. Probá de nuevo en un minuto.",
  servidor: "vita tuvo un problema de su lado. Probá de nuevo en un momento.",
  timeout: "vita tardó demasiado en responder. Probá de nuevo.",
  conexion: "vita no pudo conectarse en este momento. Probá de nuevo en un momento.",
  otro: "Algo salió mal con vita. Probá de nuevo.",
};

/** Mensaje en español para el usuario; nunca incluye el texto crudo del error. */
export function mensajeErrorProveedor(clase: ClaseErrorProveedor): string {
  return MENSAJES[clase];
}
