import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { origenPublico } from "@/lib/email/origen";

const TIPOS_OTP: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

// Solo rutas internas: evita usar el callback como open redirect.
function destinoSeguro(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

// Vuelta de Google (`code`, PKCE) y de los links de mail de Supabase Auth
// (`token_hash` + `type`: confirmación de cuenta con email, recuperación de
// contraseña, magic link). En los dos casos queda la sesión en cookies y se
// asegura la fila de `perfiles` — no hay trigger de DB, mismo criterio que
// NutrIA (el alta de perfil vive en código de la app).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Origen PÚBLICO (headers), no el de request.url: con el server en 0.0.0.0
  // o detrás de un proxy, request.url trae el host interno y la redirección
  // caía en otro origen sin las cookies de sesión recién creadas.
  const origin = await origenPublico();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const next = destinoSeguro(searchParams.get("next"));

  const supabase = await createClient();
  let usuario: { id: string; user_metadata?: Record<string, unknown> } | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) usuario = data.user;
  } else if (tokenHash && tipo && TIPOS_OTP.includes(tipo)) {
    const { data, error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) usuario = data.user;
  }

  if (!usuario) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const meta = usuario.user_metadata ?? {};
  // ignoreDuplicates: true — sin esto, un re-login pisaría el nombre
  // cada vez con el de Google, descartando cualquier edición que el
  // usuario haya hecho después en Resumen de salud. Solo se completa
  // en el primer login (insert real), nunca se actualiza acá.
  await supabase.from("perfiles").upsert(
    {
      id: usuario.id,
      nombre: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
      avatar_url: (meta.avatar_url as string | undefined) ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  return NextResponse.redirect(`${origin}${next}`);
}
