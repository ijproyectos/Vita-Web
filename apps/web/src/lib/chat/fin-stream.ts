/**
 * Decides how a chat SSE stream ended. The server always closes a healthy
 * stream with the literal `[DONE]` sentinel, so a reader that reports `done`
 * without having seen it was cut short (network drop, proxy, server crash).
 */
export type FinDeStream = "completo" | "error_reportado" | "interrumpido";

export function clasificarFinDeStream(estado: { recibioDone: boolean; huboError: boolean }): FinDeStream {
  // An explicit error event is already reported to the user by its own path;
  // it is not a cut stream, so it must not be labelled as interrupted.
  if (estado.huboError) return "error_reportado";
  return estado.recibioDone ? "completo" : "interrumpido";
}
