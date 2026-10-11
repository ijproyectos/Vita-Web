"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { eliminarCuenta } from "@/lib/cuenta/nucleo";
import { PALABRA_CONFIRMACION, type EstadoEliminarCuenta } from "@/lib/cuenta/tipos";

export async function eliminarCuentaAction(
  _prev: EstadoEliminarCuenta,
  formData: FormData
): Promise<EstadoEliminarCuenta> {
  const usuario = await requireUser();

  const confirmacion = String(formData.get("confirmacion") ?? "").trim().toUpperCase();
  if (confirmacion !== PALABRA_CONFIRMACION) {
    return { status: "error", mensaje: `Escribí ${PALABRA_CONFIRMACION} para confirmar.` };
  }

  const resultado = await eliminarCuenta(usuario.id);
  if (!resultado.ok) return { status: "error", mensaje: resultado.error };

  // El usuario ya no existe en Auth; esto solo limpia las cookies de
  // sesión de este navegador. Si falla, igual la sesión es inválida.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  redirect("/login?cuenta=eliminada");
}
