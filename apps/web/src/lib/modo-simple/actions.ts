"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { rolSobre } from "@/lib/familia/perfil-activo";
import { agregar as agregarMedicion } from "@/lib/mediciones/nucleo";
import { validarMedicion } from "@/lib/mediciones/tipos";
import { pedirAyudaAFamilia } from "@/lib/notificaciones/pedido-ayuda";
import { estaSuspendida } from "@/lib/suspensiones/guardia";
import { actualizarPrefs } from "./nucleo";
import { esTipoMedirSimple, type TipoMedirSimple } from "./medir";
import { CLAVES_BOOLEANAS_MS, esMinutosPosponer, type ParcheModoSimple } from "./tipos";

// Server Actions del modo simple. Nunca lanzan (requireUser queda fuera del try:
// redirige). La autorización real la hace la RLS de 029; el chequeo de rol solo
// da un mensaje claro antes.
export type EstadoModoSimple = { status: "success" } | { status: "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAJE = "No pudimos guardar tu cambio. Probá de nuevo.";

/** Guarda UN cambio de la configuración (lista blanca de claves y valores). */
export async function guardarPrefsModoSimpleAction(personaId: string, parche: ParcheModoSimple): Promise<EstadoModoSimple> {
  await requireUser();
  if (typeof personaId !== "string" || !UUID.test(personaId) || !parche || typeof parche !== "object") {
    return { status: "error", message: MENSAJE };
  }

  const limpio: ParcheModoSimple = {};
  for (const [clave, valor] of Object.entries(parche)) {
    if ((CLAVES_BOOLEANAS_MS as readonly string[]).includes(clave)) {
      if (typeof valor !== "boolean") return { status: "error", message: MENSAJE };
      (limpio as Record<string, boolean>)[clave] = valor;
    } else if (clave === "posponer_min") {
      if (!esMinutosPosponer(valor)) return { status: "error", message: "El tiempo elegido no es válido." };
      limpio.posponer_min = valor;
    } else if (clave !== "llamar_nombre" && clave !== "llamar_telefono") {
      return { status: "error", message: MENSAJE };
    }
  }
  if ("llamar_nombre" in parche || "llamar_telefono" in parche) {
    const nombre = typeof parche.llamar_nombre === "string" ? parche.llamar_nombre.trim() : null;
    const tel = typeof parche.llamar_telefono === "string" ? parche.llamar_telefono.trim() : null;
    if (!!nombre !== !!tel) return { status: "error", message: "Hace falta un nombre y un teléfono." };
    if (nombre && (nombre.length > 80 || tel!.length > 40 || !/^[\d\s+()-]{6,}$/.test(tel!))) {
      return { status: "error", message: "El teléfono no es válido." };
    }
    limpio.llamar_nombre = nombre || null;
    limpio.llamar_telefono = tel || null;
  }
  if (Object.keys(limpio).length === 0) return { status: "error", message: MENSAJE };

  try {
    if ((await rolSobre(personaId)) !== "editar") {
      return { status: "error", message: "Solo un Admin puede cambiar el modo simple de esta persona." };
    }
    const supabase = await createClient();
    const r = await actualizarPrefs(supabase, personaId, limpio);
    if (!r.ok) return { status: "error", message: MENSAJE };
  } catch {
    return { status: "error", message: MENSAJE };
  }
  revalidatePath("/app/modo-simple");
  revalidatePath(`/app/familia/${personaId}/modo-simple`);
  return { status: "success" };
}

/**
 * "¿Lo anoto así?" de la pantalla de voz: guarda la medición que vita propuso (`medicion_propuesta`) y la
 * persona confirmó. Siempre para la cuenta LOGUEADA (nunca un id que venga del cliente); la RLS manda.
 */
export async function guardarMedicionSimpleAction(datos: {
  tipo: TipoMedirSimple;
  valor: number;
  valorSecundario?: number | null;
}): Promise<EstadoModoSimple> {
  const user = await requireUser();
  const MENSAJE_MEDICION = "No pudimos anotarlo. Probá de nuevo.";
  try {
    if (!datos || !esTipoMedirSimple(datos.tipo)) return { status: "error", message: MENSAJE_MEDICION };
    const entrada = { tipo: datos.tipo, valor: datos.valor, valorSecundario: datos.valorSecundario ?? undefined };
    const validado = validarMedicion(entrada);
    if (!validado.ok) return { status: "error", message: validado.message };
    const supabase = await createClient();
    // Lo validado (normalizado) es lo que la persona vio y confirmó, no el objeto crudo del cliente.
    await agregarMedicion(supabase, user.id, validado.datos);
    revalidatePath("/app/mi-salud");
    return { status: "success" };
  } catch {
    return { status: "error", message: MENSAJE_MEDICION };
  }
}

export type ResultadoAyudaSimple =
  | { status: "avisado"; nombres: string[] }
  | { status: "no-avisado"; razon: "sin-cuidadores" | "tope" | "error" };

/** Lo que ve quien cuida en el aviso (no lo escribe el cliente ni el modelo). */
const MOTIVO_BOTON_AYUDA = "Tocó el botón Ayuda en su celular.";

/**
 * Botón "Ayuda" del modo simple, después de confirmar y de la cuenta regresiva:
 * avisa a todos sus cuidadores aceptados (feed + push), igual que la charla
 * (`pedirAyudaAFamilia`). Siempre es la cuenta logueada. "avisado" solo cuando
 * el servidor lo confirmó (enviado, o ya se les había avisado hace un rato).
 */
export async function pedirAyudaSimpleAction(): Promise<ResultadoAyudaSimple> {
  try {
    // Sin `requireUser`: redirige al login, y con la sesión vencida la persona tiene que
    // poder llamar igual. Sin sesión: "no-avisado" y la pantalla ofrece llamar.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { status: "no-avisado", razon: "error" };
    // Igual que /api/chat: una cuenta suspendida no manda avisos (la pantalla ofrece llamar).
    if (await estaSuspendida()) return { status: "no-avisado", razon: "error" };
    const r = await pedirAyudaAFamilia(supabase, data.user.id, MOTIVO_BOTON_AYUDA);
    if (r.status === "enviado" || r.status === "repetido") return { status: "avisado", nombres: r.nombres };
    if (r.status === "sin-cuidadores" || r.status === "tope") return { status: "no-avisado", razon: r.status };
    return { status: "no-avisado", razon: "error" };
  } catch {
    return { status: "no-avisado", razon: "error" };
  }
}
