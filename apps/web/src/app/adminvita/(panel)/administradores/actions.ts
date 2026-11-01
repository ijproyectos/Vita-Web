"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/acceso";
import { agregarAdministrador, revocarAdministrador } from "@/lib/admin/administradores";
import { autorizarGestionAdmins } from "@/lib/admin/decision";

export type EstadoGestionAdmins = { status: "idle" } | { status: "success"; mensaje: string } | { status: "error"; mensaje: string };

// Cada acción llama a `requireAdmin()` ELLA misma y después exige ser DUEÑO en el servidor: ocultar el formulario a
// los administradores es solo comodidad. Nunca lanza (el redirect de requireAdmin es el mecanismo de Next).

export async function agregarAdministradorAction(_previo: EstadoGestionAdmins, formData: FormData): Promise<EstadoGestionAdmins> {
  const admin = await requireAdmin();
  const permiso = autorizarGestionAdmins(admin.rol);
  if (!permiso.ok) return { status: "error", mensaje: permiso.mensaje };
  const r = await agregarAdministrador(admin, formData.get("email"));
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  revalidatePath("/adminvita/administradores");
  return { status: "success", mensaje: r.mensaje };
}

export async function revocarAdministradorAction(email: string): Promise<EstadoGestionAdmins> {
  const admin = await requireAdmin();
  const permiso = autorizarGestionAdmins(admin.rol);
  if (!permiso.ok) return { status: "error", mensaje: permiso.mensaje };
  const r = await revocarAdministrador(admin, email);
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  revalidatePath("/adminvita/administradores");
  return { status: "success", mensaje: r.mensaje };
}
