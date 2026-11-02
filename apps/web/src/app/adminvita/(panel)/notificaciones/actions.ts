"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/acceso";
import { cancelarEnvioMasivo, crearEnvioMasivo } from "@/lib/admin/envios-masivos";

export type EstadoEnvioMasivo = { status: "success"; mensaje: string } | { status: "error"; mensaje: string };

// Cada acción llama a `requireAdmin()` ELLA misma antes de leer nada. Dueños y administradores pueden enviar y
// cancelar. Solo crea o cancela el trabajo: el envío real lo hace el cron por lotes. Nunca lanza.

export async function crearEnvioMasivoAction(titulo: string, cuerpo: string, enlace: string): Promise<EstadoEnvioMasivo> {
  const admin = await requireAdmin();
  const r = await crearEnvioMasivo(admin, { titulo, cuerpo, enlace });
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  revalidatePath("/adminvita/notificaciones");
  return { status: "success", mensaje: r.mensaje };
}

export async function cancelarEnvioMasivoAction(id: string): Promise<EstadoEnvioMasivo> {
  const admin = await requireAdmin();
  const r = await cancelarEnvioMasivo(admin, id);
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  revalidatePath("/adminvita/notificaciones");
  return { status: "success", mensaje: r.mensaje };
}
