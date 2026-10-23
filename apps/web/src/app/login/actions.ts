"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { entrarConCodigo, verCodigo } from "@/lib/acceso-codigo/nucleo";
import type { VistaPreviaCodigo } from "@/lib/acceso-codigo/tipos";

export type EstadoEntrarConCodigo = { status: "idle" } | { status: "error"; mensaje: string };

const MSG_INVALIDO = "Código incorrecto o vencido.";

async function ipDelCliente(): Promise<string> {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
}

export type EstadoVerCodigo =
  | { status: "ok"; vista: VistaPreviaCodigo }
  // `sinVista`: no se pudo mirar el código (error interno): la pantalla sigue
  // por el camino directo de siempre, sin el "¿Sos vos?".
  | { status: "sinVista" }
  | { status: "error"; mensaje: string };

// "¿Sos vos?" (Onboarding V7 `isWho`): mira a quién pertenece el código SIN
// consumirlo. Sirve tanto en /login (sin sesión) como en /onboarding/inicio.
// Mismo throttling por IP que entrarConCodigoAction. Nunca lanza.
export async function verCodigoAction(codigo: string): Promise<EstadoVerCodigo> {
  const limpio = String(codigo ?? "").trim();
  if (!/^\d{6}$/.test(limpio)) return { status: "error", mensaje: "Ingresá el código de 6 dígitos." };
  const r = await verCodigo(limpio, await ipDelCliente());
  if (r.ok) return { status: "ok", vista: r.vista };
  if (r.motivo === "bloqueado") return { status: "error", mensaje: "Demasiados intentos. Esperá unos minutos." };
  if (r.motivo === "invalido") return { status: "error", mensaje: MSG_INVALIDO };
  return { status: "sinVista" };
}

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

  const ip = await ipDelCliente();

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
