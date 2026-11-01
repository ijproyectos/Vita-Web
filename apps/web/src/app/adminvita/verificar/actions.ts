"use server";

import { redirect } from "next/navigation";
import { confirmarCodigoVerificacion, enviarCodigoVerificacion, type RespuestaVerificacion } from "@/lib/admin/verificacion";

// Server Actions del segundo factor. Cada una revalida la sesión de admin dentro de `lib/admin/verificacion.ts`
// (los layouts y las páginas no protegen las acciones). Nunca lanzan: devuelven { status, mensaje }.

export async function enviarCodigoAction(): Promise<RespuestaVerificacion> {
  return enviarCodigoVerificacion();
}

export async function verificarCodigoAction(_previo: RespuestaVerificacion | null, formData: FormData): Promise<RespuestaVerificacion> {
  const codigo = formData.get("codigo");
  const r = await confirmarCodigoVerificacion(typeof codigo === "string" ? codigo : "");
  if (r.status === "success") redirect("/adminvita");
  return r;
}
