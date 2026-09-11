"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import type { Condicion } from "@/lib/perfil/tipos";

// Paso 1: nombre. Se guarda pero NO se marca onboarding_completado_at
// todavía (falta el paso 2). "Omitir" también guarda lo que haya y avanza.
export async function guardarNombreAction(nombre: string) {
  const usuario = await requireUser();
  const supabase = await createClient();
  if (nombre.trim()) {
    await perfilNucleo.actualizarPerfil(supabase, usuario.id, { nombre: nombre.trim() });
  }
  redirect("/onboarding/chat");
}

// Paso 2: encuesta scripteada — guion fijo, no pasa por Anthropic (mismo
// criterio que OnboardingChatScreen.jsx del diseño). Siembra
// condiciones/alergias reales según lo respondido y marca el onboarding
// como completo — recién ahí el layout de /app deja pasar.
export async function completarOnboardingAction(datos: {
  edadRango?: string;
  condicion?: string;
  medicamentos?: string;
}) {
  const usuario = await requireUser();
  const supabase = await createClient();

  // El chip "Alergias" responde a "¿tenés alguna condición de salud?" pero
  // no es una condición — va a alergiasSeed, no a condicionesSeed (bug
  // real encontrado por el review: quedaba una condición literalmente
  // llamada "Alergias" mientras el campo de alergias real quedaba vacío).
  const condicionesSeed: Condicion[] = [];
  const alergiasSeed: string[] = [];
  if (datos.condicion === "Alergias") {
    alergiasSeed.push("Alergias"); // sin detalle — el chip no pide cuál, se afina después en Resumen de salud
  } else if (datos.condicion && datos.condicion !== "Ninguna por ahora") {
    condicionesSeed.push({ label: datos.condicion, tipo: "permanente", desde: String(new Date().getFullYear()) });
  }

  await perfilNucleo.completarOnboarding(supabase, usuario.id, {
    edadRango: datos.edadRango,
    condicionesSeed,
    alergiasSeed,
  });

  redirect("/app");
}

export async function omitirOnboardingAction() {
  const usuario = await requireUser();
  const supabase = await createClient();
  await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  redirect("/app");
}
