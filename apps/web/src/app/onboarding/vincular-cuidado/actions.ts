"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";

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

// Reusable fuera del onboarding también (ver "+ Vincular a alguien" desde
// /app/perfil) — no asume que la persona está a mitad de un flujo de
// onboarding.
export async function generarVinculoAction(): Promise<EstadoVinculoGenerado> {
  const usuario = await requireUser();
  const supabase = await createClient();

  try {
    const vinculo = await cuidadoresNucleo.crearVinculoComoCuidador(supabase, usuario.id);
    return { status: "listo", codigo: vinculo.codigo ?? "", expiraAt: vinculo.expira_at };
  } catch (e) {
    return { status: "error", mensaje: e instanceof Error ? e.message : "No se pudo generar el código." };
  }
}
