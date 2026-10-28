/**
 * Decides how a chat SSE stream ended. The server always closes a healthy
 * stream with the literal `[DONE]` sentinel, so a reader that reports `done`
 * without having seen it was cut short (network drop, proxy, server crash).
 */
export type FinDeStream = "completo" | "interrumpido";

export function clasificarFinDeStream(estado: { recibioDone: boolean; huboError: boolean }): FinDeStream {
  // An explicit error event is already reported to the user by its own path.
  if (estado.huboError) return "completo";
  return estado.recibioDone ? "completo" : "interrumpido";
}
