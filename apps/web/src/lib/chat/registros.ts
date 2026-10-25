import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FilaRegistroChat } from "./registros-logica";

/**
 * Inserta la fila de registros_chat. Best-effort: nunca lanza, nunca se espera antes de que el
 * usuario vea la respuesta (la ruta lo agenda con `after`). Tabla inexistente (migración 033 sin
 * aplicar) o cualquier otro fallo se ignoran; el log no incluye datos del usuario.
 *
 * Usa el cliente service_role porque la tabla tiene RLS sin policies (como uso_ia_diario). Es el
 * mismo patrón sancionado que `registrarUsoIA`: código de sistema que escribe contabilidad DESPUÉS
 * de que la sesión ya autenticó al usuario; el usuario_id sale de esa sesión, nunca del cliente.
 */
export async function registrarRespuestaChat(fila: FilaRegistroChat): Promise<void> {
  try {
    const { error } = await createAdminClient().from("registros_chat").insert(fila);
    if (error) console.warn("registros_chat: no se pudo guardar el registro", error.code ?? "");
  } catch {
    console.warn("registros_chat: no se pudo guardar el registro");
  }
}
