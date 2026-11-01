"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/acceso";
import { crearCodigos, revocarCodigo } from "@/lib/admin/codigos";
import { validarAltaCodigos, type TipoCodigo } from "@/lib/vita-plus/codigos";

export type EstadoAltaCodigos =
  | { status: "idle" }
  | { status: "error"; mensaje: string }
  | { status: "success"; tipo: TipoCodigo; codigos: string[]; aviso?: string };

// Las acciones del panel llaman a `requireAdmin()` ellas mismas: ni el layout ni la página las protegen. Nunca
// lanzan (el redirect de requireAdmin es el mecanismo de Next para mandar a ingresar/verificar).

export async function crearCodigosAction(_previo: EstadoAltaCodigos, formData: FormData): Promise<EstadoAltaCodigos> {
  const admin = await requireAdmin();
  const v = validarAltaCodigos(
    { tipo: formData.get("tipo"), usosMax: formData.get("usosMax"), vence: formData.get("vence"), cantidad: formData.get("cantidad") },
    Date.now(),
  );
  if (!v.ok) return { status: "error", mensaje: v.mensaje };
  const r = await crearCodigos(admin, v.datos);
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  revalidatePath("/adminvita/codigos");
  return { status: "success", tipo: v.datos.tipo, codigos: r.codigos, aviso: r.aviso };
}

export type EstadoRevocar = { status: "success" } | { status: "error"; mensaje: string };

export async function revocarCodigoAction(id: string): Promise<EstadoRevocar> {
  const admin = await requireAdmin();
  const r = await revocarCodigo(admin, typeof id === "string" ? id : "");
  if (!r.ok) return { status: "error", mensaje: r.mensaje };
  revalidatePath("/adminvita/codigos");
  return { status: "success" };
}
