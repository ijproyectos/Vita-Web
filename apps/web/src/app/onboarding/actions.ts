"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import * as medicamentosNucleo from "@/lib/medicamentos/nucleo";
import type { Condicion, UsoApp } from "@/lib/perfil/tipos";
import type { MotivoReclamoElderRechazado } from "@/lib/cuidadores/tipos";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import { HORA_POR_MOMENTO } from "@/lib/medicamentos/tipos";
import { CONDICIONES } from "@/lib/onboarding/catalogo-condiciones";

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

// Paso "¿para quién vas a usar la app?" (app/onboarding/para-quien/) —
// primer paso real del onboarding. Se guarda una sola vez; a partir de acá
// el flujo por defecto es el conversacional nuevo (/onboarding/conversar),
// que rama internamente según el valor guardado (tabs "persona"+"vos" para
// cuido/ambos, un único tab "vos" para "yo"). El guion viejo
// (/onboarding/nombre → /onboarding/chat, catálogo sin IA) sigue existiendo
// como fallback manual — ver el link "Prefiero un formulario" dentro del
// flujo conversacional.
export async function guardarUsoAppAction(usoApp: UsoApp) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await perfilNucleo.guardarUsoApp(supabase, usuario.id, usoApp);
  redirect("/onboarding/conversar");
}

// Después de completar (o saltear) el onboarding: si la persona dijo que
// usa la app para cuidar a alguien, todavía le falta vincular ese celular
// — la manda a /onboarding/vincular-cuidado en vez de directo a /app.
async function redirigirSegunUsoApp(supabase: SupabaseClient, usuarioId: string): Promise<never> {
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuarioId);
  if (perfil?.uso_app === "cuido" || perfil?.uso_app === "ambos") {
    redirect("/onboarding/vincular-cuidado");
  }
  redirect("/app");
}

// Paso 2: encuesta scripteada — guion fijo, no pasa por Anthropic (mismo
// criterio que OnboardingChatScreen.jsx del diseño). Siembra
// condiciones/alergias reales según lo respondido y marca el onboarding
// como completo — recién ahí el layout de /app deja pasar.
export async function completarOnboardingAction(datos: {
  edadRango?: string;
  // Legado: el guion viejo de un solo chip para condición ("cond") pasaba
  // un string acá, con "Alergias" como caso especial (ver abajo). El guion
  // nuevo (multi-select por catálogo) pasa `condicionesIds` en su lugar —
  // se conserva este parámetro por compatibilidad, no se elimina la lógica.
  condicion?: string;
  condicionesIds?: string[];
  medicamentos?: string;
}) {
  const usuario = await requireUser();
  const supabase = await createClient();

  const condicionesSeed: Condicion[] = [];
  const alergiasSeed: string[] = [];

  // El chip "Alergias" respondía a "¿tenés alguna condición de salud?"
  // pero no es una condición — va a alergiasSeed, no a condicionesSeed
  // (bug real encontrado por el review: quedaba una condición literalmente
  // llamada "Alergias" mientras el campo de alergias real quedaba vacío).
  // "Alergias" ya no es una opción del catálogo nuevo (CONDICIONES no la
  // incluye), pero este camino se conserva por si algo todavía invoca la
  // action con el shape viejo.
  if (datos.condicion === "Alergias") {
    alergiasSeed.push("Alergias"); // sin detalle — el chip no pide cuál, se afina después en Resumen de salud
  } else if (datos.condicion && datos.condicion !== "Ninguna por ahora") {
    condicionesSeed.push({ label: datos.condicion, tipo: "permanente", desde: String(new Date().getFullYear()) });
  }

  for (const id of datos.condicionesIds ?? []) {
    if (id === "ninguna") continue;
    const label = CONDICIONES.find((c) => c.id === id)?.label ?? id;
    condicionesSeed.push({ label, tipo: "permanente", desde: String(new Date().getFullYear()) });
  }

  await perfilNucleo.completarOnboarding(supabase, usuario.id, {
    edadRango: datos.edadRango,
    condicionesSeed,
    alergiasSeed,
  });

  await redirigirSegunUsoApp(supabase, usuario.id);
}

export async function omitirOnboardingAction() {
  const usuario = await requireUser();
  const supabase = await createClient();
  await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  await redirigirSegunUsoApp(supabase, usuario.id);
}

export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

// Crea un medicamento sugerido por el catálogo (lib/onboarding/catalogo-condiciones.ts)
// durante la encuesta — llamado ad-hoc (no vía <form action>) desde cada
// micro-form "medicamento-form" del guion, así que nunca redirige, solo
// informa éxito/error (mismo shape que el resto de las Server Actions de
// este proyecto, que nunca lanzan).
export async function agregarMedicamentoCatalogoAction(datos: {
  nombre: string;
  dosis: string | null;
  unidad?: string;
  momentoDia: MomentoDia;
  frecuencia: string;
  condicion: string | null;
}): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  try {
    await medicamentosNucleo.agregar(supabase, usuario.id, {
      nombre: datos.nombre,
      dosis: datos.dosis,
      unidad: datos.unidad,
      horaProgramada: HORA_POR_MOMENTO[datos.momentoDia],
      momentoDia: datos.momentoDia,
      condicion: datos.condicion,
      frecuencia: datos.frecuencia,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  return { status: "success" };
}

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

  await perfilNucleo.guardarUsoApp(supabase, usuario.id, "yo");
  await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  redirect("/app/modo-simple");
}
