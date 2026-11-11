"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import type { UsoApp } from "@/lib/perfil/tipos";
import type { MotivoReclamoElderRechazado } from "@/lib/cuidadores/tipos";

// Las acciones que terminan en redirect() solo "devuelven" si algo falló
// (redirect lanza un control-flow error que Next intercepta): nunca lanzan.
type ErrorAccion = { status: "error"; message: string } | void;

function mensajeDe(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "No pudimos guardar. Probá de nuevo.";
}

// Paso "¿para quién vas a usar la app?" (app/onboarding/para-quien/) —
// primer paso real del onboarding. Se guarda una sola vez; a partir de acá
// el flujo por defecto es el conversacional nuevo (/onboarding/conversar),
// que rama internamente según el valor guardado (tabs "persona"+"vos" para
// cuido/ambos, un único tab "vos" para "yo").
export async function guardarUsoAppAction(usoApp: UsoApp): Promise<ErrorAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();
  try {
    await perfilNucleo.guardarUsoApp(supabase, usuario.id, usoApp);
  } catch (e) {
    return { status: "error", message: mensajeDe(e) };
  }
  redirect("/onboarding/conversar");
}

// "Omitir" de la bienvenida (/onboarding/inicio): se salta la intro y el
// "¿cómo vas a usar vita?" y va directo a cargar datos (/onboarding/conversar).
// NO marca el onboarding como completo. Como el chat necesita `uso_app`, si
// todavía no hay respuesta se asume "yo" (se puede cambiar desde el perfil).
export async function omitirIntroAction() {
  let destino = "/onboarding/conversar";
  const usuario = await requireUser();
  try {
    const supabase = await createClient();
    const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id);
    if (!perfil?.uso_app) await perfilNucleo.guardarUsoApp(supabase, usuario.id, "yo");
  } catch {
    destino = "/onboarding/para-quien";
  }
  redirect(destino);
}

export type { EstadoAccion } from "@/lib/acciones";

// Mismo criterio de nunca dejar escapar un motivo crudo de Postgres/RPC
// que aceptarInvitacionAction (app/cuidar/invitacion/[token]/actions.ts) —
// reclamarVinculoComoElder ya devuelve un ResultadoReclamoElder tipado
// (nunca lanza), pero acá se remapea explícito en vez de reenviar
// resultado.mensaje tal cual (ese mensaje interpola el error crudo de
// Postgres en el caso "error_desconocido", pensado para logs).
const MENSAJE_POR_MOTIVO_CODIGO: Record<MotivoReclamoElderRechazado, string> = {
  codigo_no_encontrado: "Este código no existe o ya fue usado.",
  codigo_expirado: "Este código ya venció. Pedile a la persona que te lo compartió que genere uno nuevo.",
  ya_vinculado: "Ya estás vinculado con esa persona.",
  autovinculo_no_permitido:
    "No podés usar un código que generaste vos. Pasáselo a la persona que cuidás para que lo ingrese en su celular.",
  error_desconocido: "No pudimos procesar el código. Probá de nuevo en unos minutos.",
};

export type EstadoReclamoCodigo = { status: "idle" } | { status: "error"; mensaje: string };

// Paso "Sí, tengo un código" de /onboarding/inicio — a diferencia del
// resto del onboarding, un reclamo exitoso salta TODO el resto del guion:
// esta persona es el elder (uso_app "yo" implícito, ella misma es quien
// usa la app), y su cuidador ya la va a estar viendo desde /cuidar, así
// que va directo a /app/modo-simple.
export async function reclamarCodigoAction(
  _prev: EstadoReclamoCodigo,
  formData: FormData
): Promise<EstadoReclamoCodigo> {
  const usuario = await requireUser();

  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!/^\d{6}$/.test(codigo)) {
    return { status: "error", mensaje: "Ingresá el código de 6 dígitos." };
  }

  const supabase = await createClient();
  const resultado = await cuidadoresNucleo.reclamarVinculoComoElder(supabase, codigo);

  if ("error" in resultado) {
    return { status: "error", mensaje: MENSAJE_POR_MOTIVO_CODIGO[resultado.error] };
  }

  // El código ya quedó consumido: si esto falla, reintentar el mismo código
  // daría "ya fue usado". Se avisa que ya está vinculado y que entre igual.
  try {
    await perfilNucleo.guardarUsoApp(supabase, usuario.id, "yo");
    await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  } catch {
    return {
      status: "error",
      mensaje: "Ya quedaste vinculado, pero no pudimos terminar de configurar tu cuenta. Entrá a vita para continuar.",
    };
  }
  redirect("/app/modo-simple");
}
