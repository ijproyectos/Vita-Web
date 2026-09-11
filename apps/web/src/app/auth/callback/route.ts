import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google redirects here con un `code` después de que el usuario aprueba el
// consentimiento. Intercambia el code por una sesión y se asegura de que
// `perfiles` tenga una fila para este usuario (nombre/avatar desde el
// metadata de Google) — no hay trigger de DB, mismo criterio que NutrIA
// (el alta de perfil vive en código de la app).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { id, user_metadata } = data.user;
      // ignoreDuplicates: true — sin esto, un re-login pisaría el nombre
      // cada vez con el de Google, descartando cualquier edición que el
      // usuario haya hecho después en Resumen de salud. Solo se completa
      // en el primer login (insert real), nunca se actualiza acá.
      await supabase.from("perfiles").upsert(
        {
          id,
          nombre: user_metadata?.full_name ?? user_metadata?.name ?? null,
          avatar_url: user_metadata?.avatar_url ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
