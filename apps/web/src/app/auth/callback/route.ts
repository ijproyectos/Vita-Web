import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google redirects here with a `code` after the user approves consent.
// Exchanges it for a session and makes sure `perfiles` has a row for this
// user (nombre/avatar desde el metadata de Google) — no hay trigger de DB,
// mismo criterio que NutrIA (el alta de perfil vive en código de la app).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { id, user_metadata } = data.user;
      await supabase.from("perfiles").upsert(
        {
          id,
          nombre: user_metadata?.full_name ?? user_metadata?.name ?? null,
          avatar_url: user_metadata?.avatar_url ?? null,
        },
        { onConflict: "id" }
      );

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
