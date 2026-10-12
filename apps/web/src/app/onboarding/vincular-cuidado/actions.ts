"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import { enviarCodigoPorMail } from "@/lib/cuidadores/correo";
import { emailValido, origenPublico } from "@/lib/email/origen";
import { permitirEnvio } from "@/lib/email/limite";

// A diferencia del resto de las Server Actions de este proyecto,
// `crearVinculoComoCuidador` SÍ puede lanzar (una colisión de código
// persistente después de su propio reintento interno es una anomalía
// real, no un resultado esperado — ver el comentario en
// lib/cuidadores/nucleo.ts). Acá se atrapa esa excepción para mantener la
// disciplina "las Server Actions nunca lanzan" en el límite de la UI,
// mismo criterio que invitarCuidadorAction con `invitar()`.
export type EstadoVinculoGenerado =
  | { status: "cargando" }
  | { status: "listo"; codigo: string; expiraAt: string }
  | { status: "error"; mensaje: string };

export type EstadoEnvioCodigo =
  | { status: "success"; nuevoCodigo?: string; expiraAt?: string }
  | { status: "error"; mensaje: string; puedeRegenerar?: boolean; nuevoCodigo?: string; expiraAt?: string };

// Manda el código por mail a la persona cuidada. No confía en el estado que
// ve el cliente: relee la fila propia (RLS `vinculos_select_cuidador`). Si el
// código venció, genera uno nuevo (conservando el perfil en borrador) y manda
// ese; si ya se usó o no existe, devuelve un error con opción de regenerar.
// Tope de 5 envíos por código en memoria (best-effort, ver lib/email/limite.ts).
export async function enviarCodigoPorMailAction(codigo: string, email: string): Promise<EstadoEnvioCodigo> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const destino = email.trim().toLowerCase();
  if (!emailValido(destino)) return { status: "error", mensaje: "Ingresá un email válido." };

  const consulta = await cuidadoresNucleo.obtenerCodigoVigente(supabase, usuario.id, codigo);
  if (consulta.estado === "usado") {
    return {
      status: "error",
      mensaje: "Este código ya se usó para vincular. Generá uno nuevo para otra persona.",
      puedeRegenerar: true,
    };
  }
  if (consulta.estado === "no_encontrado") {
    return {
      status: "error",
      mensaje: "No encontramos este código. Generá uno nuevo y probá de nuevo.",
      puedeRegenerar: true,
    };
  }

  let codigoAEnviar = codigo;
  let vinculoId: string;
  let expiraAt: string;
  let nuevoCodigo: string | undefined;

  if (consulta.estado === "vencido") {
    try {
      const perfilPendienteId = await cuidadoresNucleo.perfilPendienteDeVinculo(
        supabase,
        usuario.id,
        consulta.id
      );
      const nuevo = await cuidadoresNucleo.crearVinculoComoCuidador(supabase, usuario.id, perfilPendienteId);
      codigoAEnviar = nuevo.codigo ?? "";
      vinculoId = nuevo.id;
      expiraAt = nuevo.expira_at;
      nuevoCodigo = codigoAEnviar;
    } catch {
      return { status: "error", mensaje: "El código venció y no pudimos generar uno nuevo.", puedeRegenerar: true };
    }
  } else {
    vinculoId = consulta.id;
    expiraAt = consulta.expiraAt;
  }

  if (!permitirEnvio(vinculoId)) {
    return { status: "error", mensaje: "Ya mandamos varios mails con este código. Compartilo por WhatsApp." };
  }

  const envio = await enviarCodigoPorMail(
    supabase,
    usuario.id,
    destino,
    codigoAEnviar,
    expiraAt,
    await origenPublico()
  );
  if (!envio.ok) {
    // El código nuevo (si se generó) igual existe: se devuelve para que la
    // pantalla lo muestre aunque el mail haya fallado.
    return {
      status: "error",
      mensaje: nuevoCodigo
        ? "El código había vencido y generamos uno nuevo, pero no pudimos mandar el mail. Compartilo por WhatsApp."
        : "No pudimos mandar el mail. Compartí el código por WhatsApp.",
      nuevoCodigo,
      expiraAt: nuevoCodigo ? expiraAt : undefined,
    };
  }
  return nuevoCodigo ? { status: "success", nuevoCodigo, expiraAt } : { status: "success" };
}

// Reusable fuera del onboarding también (ver "+ Vincular a alguien" desde
// /app/perfil) — no asume que la persona está a mitad de un flujo de
// onboarding. `perfilPendienteId` (opcional, onboarding conversacional
// nuevo) — cuando viene del flujo de /onboarding/conversar, linkea el
// código generado al perfil en borrador que ya se armó (ver
// crearVinculoComoCuidador en lib/cuidadores/nucleo.ts); "+ Vincular a
// alguien" desde /app/perfil no tiene un perfil en borrador y sigue sin
// pasarlo, comportamiento sin cambios.
export async function generarVinculoAction(perfilPendienteId?: string): Promise<EstadoVinculoGenerado> {
  const usuario = await requireUser();
  const supabase = await createClient();

  try {
    const vinculo = await cuidadoresNucleo.crearVinculoComoCuidador(supabase, usuario.id, perfilPendienteId);
    return { status: "listo", codigo: vinculo.codigo ?? "", expiraAt: vinculo.expira_at };
  } catch (e) {
    return { status: "error", mensaje: e instanceof Error ? e.message : "No se pudo generar el código." };
  }
}
