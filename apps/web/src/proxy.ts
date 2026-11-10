import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_ADMIN, leerSecretoSesion, opcionesCookieAdmin, renovarSiVigente } from "@/lib/admin/sesion";
import { COOKIE_MODO_SIMPLE, OPCIONES_COOKIE_MODO_SIMPLE, modoSimpleActivoPara, rutaPermitidaModoSimple } from "@/lib/modo-simple/recordar";

// Refreshes the Supabase session cookie on every request. Server Components
// cannot write cookies (see lib/supabase/server.ts), so without this an
// expired access token is never persisted and the user gets bounced to
// /login mid-session by requireUser(). Access control stays in lib/dal.ts.
// The only redirect here is navigational: the remembered simple mode (below).
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
  // Los prefetch del router no cuentan como actividad y los POST (Server Actions, entre ellas el cierre de sesión) nunca renuevan: así el Set-Cookie que borra la cookie no se pisa. Solo se renueva una cookie ya válida para esta sesión.
  const ruta = request.nextUrl.pathname;
  if (
    (ruta === "/adminvita" || ruta.startsWith("/adminvita/")) &&
    user?.email &&
    (request.method === "GET" || request.method === "HEAD") &&
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

  // Modo simple recordado en este dispositivo (cookie = id de la cuenta que lo activó). Igual en Android e iPhone.
  // 1) Guardia: una pantalla de la app normal (p. ej. la que abre un aviso del celular) vuelve al modo simple.
  //    Solo GET: los POST son Server Actions y no se redirigen.
  // 2) Renovación: la cookie la escribe la página y Safari limita esas a 7 días; acá la reescribe el servidor
  //    al abrir la app (carga completa, sin el header `rsc`). No en los refrescos del router, para que uno en
  //    vuelo no reviva la cookie justo después de "Salir del modo simple".
  //    Las precargas del router no se redirigen: la redirección quedaría guardada en su memoria y podría
  //    pisar una navegación real después de "Salir del modo simple". La navegación real sí pasa por acá.
  const modoSimple = request.cookies.get(COOKIE_MODO_SIMPLE)?.value;
  const esPrecarga =
    !!request.headers.get("next-router-prefetch") ||
    !!request.headers.get("next-router-segment-prefetch") ||
    request.headers.get("purpose") === "prefetch";
  if (user && !esPrecarga && modoSimpleActivoPara(modoSimple, user.id) && (request.method === "GET" || request.method === "HEAD")) {
    if (!request.headers.get("rsc")) {
      response.cookies.set(COOKIE_MODO_SIMPLE, user.id, OPCIONES_COOKIE_MODO_SIMPLE);
    }
    if (!rutaPermitidaModoSimple(ruta)) {
      const destino = request.nextUrl.clone();
      destino.pathname = "/app/modo-simple";
      destino.search = "";
      const redireccion = NextResponse.redirect(destino);
      response.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
      return redireccion;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, image optimization, vita avatar frames and the
    // cron, Mercado Pago webhook and anonymous web-vitals endpoints (authenticated by x-cron-secret / x-signature, or public, not by session).
    "/((?!_next/static|_next/image|favicon.ico|vita/|api/cron/|api/version|api/vitals|api/mercadopago/|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
