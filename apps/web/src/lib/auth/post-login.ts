import type { SupabaseClient } from "@supabase/supabase-js";

export type UsuarioAuth = { id: string; user_metadata?: Record<string, unknown> };

// Shared post-login step for every way of getting a session (OAuth callback,
// email links, native ID-token sign-in via /auth/continuar): ensure the
// `perfiles` row exists — there is no DB trigger, profile creation lives in
// app code (same criterion as NutrIA).
//
// ignoreDuplicates: true — otherwise a re-login would overwrite the name with
// the provider's every time, discarding any edit the user made afterwards in
// Resumen de salud. It is only filled on the first login (real insert).
export async function asegurarPerfil(supabase: SupabaseClient, usuario: UsuarioAuth): Promise<void> {
  const meta = usuario.user_metadata ?? {};
  await supabase.from("perfiles").upsert(
    {
      id: usuario.id,
      nombre: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
      avatar_url: (meta.avatar_url as string | undefined) ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}
