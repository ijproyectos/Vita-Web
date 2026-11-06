import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireNoSuspendida } from "@/lib/suspensiones/guardia";
import { listarElders } from "@/lib/cuidadores/nucleo";
import type { ElderVinculado } from "@/lib/cuidadores/tipos";

/**
 * Vitapp is single-tenant per user — no role to resolve (unlike NutrIA's
 * profesional/paciente split). Any authenticated user is a full user of
 * the app, so the only guard needed is "is there a session at all".
 */
async function resolverUsuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Los layouts no se re-ejecutan en Server Actions ni en navegaciones del cliente, y el JWT de una cuenta suspendida
  // vale hasta 1 h: el chequeo vive acá para que toda página y acción que pase por `requireUser` lo herede. Una consulta
  // indexada por request (cache), fail-open (el ban de Auth cubre login y refresh).
  await requireNoSuspendida();

  return user;
}

/**
 * Memoizado por request (`cache` de React): layout, página y helpers que piden
 * el usuario en el mismo render comparten UNA llamada a Auth y una a la
 * suspensión. `getUser()` valida el token contra Auth (el JWT es HS256 legacy;
 * no se cambia a `getClaims`). Un request nuevo vuelve a validar todo.
 */
export const requireUser = cache(resolverUsuario);

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
