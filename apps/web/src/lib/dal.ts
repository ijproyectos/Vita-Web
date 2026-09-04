import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
