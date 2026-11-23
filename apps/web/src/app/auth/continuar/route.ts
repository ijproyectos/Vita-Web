import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { origenPublico } from "@/lib/email/origen";
import { destinoSeguro } from "@/lib/navegacion/destino-seguro";
import { asegurarPerfil } from "@/lib/auth/post-login";

// Post-login for an ALREADY authenticated session: the native Google/Apple
// sign-in (`signInWithIdToken` in the browser) leaves the session in cookies
// but there is no `code` to exchange, so /auth/callback doesn't apply. Same
// post-login work and same open-redirect guard as the callback.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = await origenPublico();
  const next = destinoSeguro(searchParams.get("next"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  await asegurarPerfil(supabase, data.user);
  return NextResponse.redirect(`${origin}${next}`);
}
