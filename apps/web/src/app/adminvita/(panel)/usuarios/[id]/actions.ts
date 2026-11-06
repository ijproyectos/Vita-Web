"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/acceso";
import { reactivarCuenta, suspenderCuenta, type ResultadoSuspension } from "@/lib/admin/suspensiones";
import { enviarMensajeAUsuario, type ResultadoPushAdmin } from "@/lib/admin/push";
import { definirLimiteInteracciones, type ResultadoLimiteInteracciones } from "@/lib/admin/limite-interacciones";

// Límite diario de consultas con vita de una persona: dueños y administradores. `requireAdmin()` va PRIMERO.
export async function definirLimiteInteraccionesAction(
  usuarioId: string,
  limite: string,
  motivo: string,
  volverAlGeneral: boolean,
): Promise<ResultadoLimiteInteracciones> {
  const admin = await requireAdmin();
  const id = typeof usuarioId === "string" ? usuarioId : "";
  const r = await definirLimiteInteracciones(admin, id, { limite, motivo, volverAlGeneral: volverAlGeneral === true });
  if (r.status === "success") revalidatePath(`/adminvita/usuarios/${id}`);
  return r;
}

// Server Action del panel: llama a `requireAdmin()` ELLA misma (la página y el layout no protegen las acciones),
// antes de leer nada del formulario. Nunca lanza (el redirect de requireAdmin lleva a ingresar/verificar).
export async function enviarPushAction(usuarioId: string, titulo: string, cuerpo: string): Promise<ResultadoPushAdmin> {
  const admin = await requireAdmin();
  return enviarMensajeAUsuario(admin, typeof usuarioId === "string" ? usuarioId : "", titulo, cuerpo);
}

// Suspender / reactivar: también llaman a `requireAdmin()` ELLAS mismas. Nunca lanzan. La guarda de "no suspender a un
// dueño ni a un administrador" vive en `suspenderCuenta` (servidor), no en la UI.
export async function suspenderCuentaAction(usuarioId: string, motivo: string, nota: string): Promise<ResultadoSuspension> {
  const admin = await requireAdmin();
  const r = await suspenderCuenta(admin, typeof usuarioId === "string" ? usuarioId : "", motivo, nota);
  if (r.status === "success") revalidatePath(`/adminvita/usuarios/${usuarioId}`);
  return r;
}

export async function reactivarCuentaAction(usuarioId: string): Promise<ResultadoSuspension> {
  const admin = await requireAdmin();
  const r = await reactivarCuenta(admin, typeof usuarioId === "string" ? usuarioId : "");
  if (r.status === "success") revalidatePath(`/adminvita/usuarios/${usuarioId}`);
  return r;
}
