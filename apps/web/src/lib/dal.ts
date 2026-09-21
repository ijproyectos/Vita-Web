import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarElders } from "@/lib/cuidadores/nucleo";
import type { ElderVinculado } from "@/lib/cuidadores/tipos";

/**
 * Vitapp is single-tenant per user — no role to resolve (unlike NutrIA's
 * profesional/paciente split). Any authenticated user is a full user of
 * the app, so the only guard needed is "is there a session at all".
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * Guarda para el árbol `/cuidar/*` (Modo Cuidador, Fase 3): requiere
 * sesión (igual que `requireUser`) y además al menos un vínculo
 * `aceptado` como cuidador de algún elder — sin asumir todavía a cuál en
 * particular se accede, eso lo valida cada página con el `elderId` de su
 * propia URL. Un usuario logueado sin ningún elder vinculado se
 * redirige a `/cuidar/sin-vinculos` en vez de a `/login`.
 */
export async function requireCuidador(): Promise<{
  userId: string;
  elders: ElderVinculado[];
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const elders = await listarElders(supabase, user.id);

  if (elders.length === 0) {
    redirect("/cuidar/sin-vinculos");
  }

  return { userId: user.id, elders };
}
