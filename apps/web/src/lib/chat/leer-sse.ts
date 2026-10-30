// Lector de la respuesta SSE de POST /api/chat para pantallas que no son el overlay del chat
// (hoy: la charla de voz del modo simple). El parser es PURO y se prueba aparte; la lectura del
// stream es un envoltorio fino. El overlay tiene su propio parser inline y no se toca.

export type AccionChat = { type: string; [clave: string]: unknown };

export type EventoChat =
  | { tipo: "chunk"; texto: string }
  | { tipo: "accion"; accion: AccionChat }
  | { tipo: "sesion"; id: string }
  | { tipo: "uso" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "fin" };

/** Parte el buffer en bloques completos ("\n\n") y devuelve lo que quedó sin cerrar. */
export function separarBloques(buffer: string): { bloques: string[]; resto: string } {
  const partes = buffer.split("\n\n");
  const resto = partes.pop() ?? "";
  return { bloques: partes, resto };
}

/** Un bloque SSE ("data: ...") a evento. null = bloque ajeno, vacío o JSON inválido. */
export function parsearBloqueSSE(bloque: string): EventoChat | null {
  const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
  if (!linea) return null;
  const payload = linea.slice("data: ".length);
  if (payload === "[DONE]") return { tipo: "fin" };
  let dato: unknown;
  try {
    dato = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!dato || typeof dato !== "object") return null;
  const d = dato as Record<string, unknown>;
  if (typeof d.chunk === "string") return { tipo: "chunk", texto: d.chunk };
  if (typeof d.session === "string") return { tipo: "sesion", id: d.session };
  if (typeof d.error === "string") return { tipo: "error", mensaje: d.error };
  if (d.uso && typeof d.uso === "object") return { tipo: "uso" };
  if (d.action && typeof d.action === "object" && typeof (d.action as AccionChat).type === "string") {
    return { tipo: "accion", accion: d.action as AccionChat };
  }
  return null;
}

/**
 * Lee el stream entero y avisa cada evento. Devuelve si llegó el [DONE] (si no, la respuesta se
 * cortó). Puede lanzar si la red falla o se aborta: quien llama lo captura.
 */
export async function leerEventosChat(
  cuerpo: ReadableStream<Uint8Array>,
  alEvento: (evento: EventoChat) => void
): Promise<{ terminoBien: boolean }> {
  const lector = cuerpo.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminoBien = false;
  const procesar = (bloques: string[]) => {
    for (const bloque of bloques) {
      const evento = parsearBloqueSSE(bloque);
      if (!evento) continue;
      if (evento.tipo === "fin") terminoBien = true;
      alEvento(evento);
    }
  };
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { bloques, resto } = separarBloques(buffer);
    buffer = resto;
    procesar(bloques);
  }
  // Un último bloque sin "\n\n" final.
  if (buffer.trim()) procesar([buffer]);
  return { terminoBien };
}
