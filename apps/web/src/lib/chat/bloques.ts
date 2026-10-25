import type { BloqueGuardado, BloquesTurno, MensajeBloques } from "@/lib/memoria/tipos";

// Serialización de los bloques de un turno para mensajes_chat.bloques. Lógica pura: solo se guarda lo
// que se puede volver a mandar al modelo (text, tool_use, tool_result); el razonamiento (thinking /
// redacted_thinking) y cualquier otro bloque se descartan al guardar.

type BloqueCrudo = { type?: unknown; [clave: string]: unknown };

/** Deja solo los bloques reenviables, con los campos mínimos (nada de metadatos del proveedor). */
export function bloquesReenviables(contenido: unknown): BloqueGuardado[] {
  if (typeof contenido === "string") return contenido ? [{ type: "text", text: contenido }] : [];
  if (!Array.isArray(contenido)) return [];
  const salida: BloqueGuardado[] = [];
  for (const b of contenido as BloqueCrudo[]) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") {
      salida.push({ type: "text", text: b.text });
    } else if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
      salida.push({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} });
    } else if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
      salida.push({
        type: "tool_result",
        tool_use_id: b.tool_use_id,
        content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""),
        ...(b.is_error === true ? { is_error: true } : {}),
      });
    }
  }
  return salida;
}

/** Un mensaje de la API (assistant o user con tool_result) a su forma guardada; null si queda vacío. */
export function mensajeABloques(role: "user" | "assistant", contenido: unknown): MensajeBloques | null {
  const content = bloquesReenviables(contenido);
  return content.length > 0 ? { role, content } : null;
}

/** Bloques de la fila de un mensaje del usuario: un solo mensaje con su texto. */
export function bloquesDelUsuario(texto: string): BloquesTurno {
  return [{ role: "user", content: [{ type: "text", text: texto }] }];
}

/** Bloques de una respuesta que es solo texto (por ejemplo, la resuelta por el servidor sin modelo). */
export function bloquesDeTexto(texto: string): BloquesTurno {
  return [{ role: "assistant", content: [{ type: "text", text: texto }] }];
}
