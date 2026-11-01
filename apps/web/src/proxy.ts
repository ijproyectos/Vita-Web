import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_ADMIN, leerSecretoSesion, opcionesCookieAdmin, renovarSiVigente } from "@/lib/admin/sesion";

// Refreshes the Supabase session cookie on every request. Server Components
// cannot write cookies (see lib/supabase/server.ts), so without this an
// expired access token is never persisted and the user gets bounced to
// /login mid-session by requireUser(). Access control stays in lib/dal.ts —
// this file only keeps the session alive, it never redirects.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and getUser(): getUser()
  // is what triggers the token refresh and the setAll() above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Panel /adminvita: la cookie de verificación (segundo factor) es DESLIZANTE. Los Server Components no pueden
  // escribir cookies, así que el vencimiento de 30 minutos de inactividad se corre acá, en cada vista del panel.
  // Los prefetch del router no cuentan como actividad. Solo se renueva una cookie ya válida para esta sesión.
  const ruta = request.nextUrl.pathname;
  if (
    (ruta === "/adminvita" || ruta.startsWith("/adminvita/")) &&
    user?.email &&
    !request.headers.get("next-router-prefetch") &&
    request.headers.get("purpose") !== "prefetch"
  ) {
    const secreto = leerSecretoSesion(process.env.ADMIN_SESSION_SECRET);
    const actual = request.cookies.get(COOKIE_ADMIN)?.value;
    if (secreto && actual) {
      const renovada = renovarSiVigente(actual, { secreto, userId: user.id, email: user.email, ahoraMs: Date.now() });
      if (renovada) {
        response.cookies.set(COOKIE_ADMIN, renovada, opcionesCookieAdmin(process.env.NODE_ENV === "production"));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, image optimization, vita avatar frames and the
    // cron and Mercado Pago webhook endpoints (authenticated by x-cron-secret / x-signature, not by session).
    "/((?!_next/static|_next/image|favicon.ico|vita/|api/cron/|api/mercadopago/|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
