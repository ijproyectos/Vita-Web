"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { entrarConCodigo } from "@/lib/acceso-codigo/nucleo";

export type EstadoEntrarConCodigo = { status: "idle" } | { status: "error"; mensaje: string };

const MSG_INVALIDO = "Código incorrecto o vencido.";

// Acción SIN sesión previa (es el login). Nunca lanza: todo fallo vuelve
// como mensaje genérico, sin distinguir "no existe" de "vencido" ni de "ya
// usado". El redirect queda fuera del try (lanza NEXT_REDIRECT a propósito).
export async function entrarConCodigoAction(
  _prev: EstadoEntrarConCodigo,
  formData: FormData
): Promise<EstadoEntrarConCodigo> {
  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!/^\d{6}$/.test(codigo)) {
    return { status: "error", mensaje: "Ingresá el código de 6 dígitos." };
  }

  const h = await headers();
  const ip =
    h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";

  const supabase = await createClient();
  const resultado = await entrarConCodigo(supabase, codigo, ip);

  if (!resultado.ok) {
    if (resultado.motivo === "bloqueado") {
      return { status: "error", mensaje: "Demasiados intentos. Esperá unos minutos." };
    }
    return { status: "error", mensaje: MSG_INVALIDO };
  }

  redirect("/app/modo-simple");
}
