"use server";

import { requireAdmin } from "@/lib/admin/acceso";
import { enviarMensajeAUsuario, type ResultadoPushAdmin } from "@/lib/admin/push";

// Server Action del panel: llama a `requireAdmin()` ELLA misma (la página y el layout no protegen las acciones),
// antes de leer nada del formulario. Nunca lanza (el redirect de requireAdmin lleva a ingresar/verificar).
export async function enviarPushAction(usuarioId: string, titulo: string, cuerpo: string): Promise<ResultadoPushAdmin> {
  const admin = await requireAdmin();
  return enviarMensajeAUsuario(admin, typeof usuarioId === "string" ? usuarioId : "", titulo, cuerpo);
}
