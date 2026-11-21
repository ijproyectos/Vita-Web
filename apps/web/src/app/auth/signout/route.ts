import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { origenPublico } from "@/lib/email/origen";
import { borrarSuscripcion, borrarTokenNativo } from "@/lib/notificaciones/push";
import { esTokenNativoValido } from "@/lib/notificaciones/push-fcm-logica";
import { COOKIE_MODO_SIMPLE } from "@/lib/modo-simple/recordar";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Shared device: drop THIS device's push subscription before ending the
  // session (the delete needs it), so the next person does not receive the
  // previous user's reminders. Best effort: never blocks the logout.
  try {
    const formData = await request.formData();
    const endpoint = formData.get("endpoint");
    const tokenNativo = formData.get("tokenNativo");
    const endpointValido = typeof endpoint === "string" && endpoint.startsWith("https://") && endpoint.length < 2048;
    const tokenValido = esTokenNativoValido(tokenNativo);
    if (endpointValido || tokenValido) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        if (endpointValido) await borrarSuscripcion(supabase, user.id, endpoint);
        // Native app (Capacitor): same idea with this device's FCM token.
        if (tokenValido) await borrarTokenNativo(supabase, user.id, tokenNativo);
      }
    }
  } catch {
    // Missing/invalid body or DB error: continue with the logout.
  }

  // scope "local": only ends this device's session. The default ("global")
  // revokes every session of the user, logging them out of all devices.
  await supabase.auth.signOut({ scope: "local" });

  // Public origin from the request headers (request.url can carry the
  // internal host behind a proxy or when the server listens on 0.0.0.0).
  // The next person on this device should not land in modo simple.
  const respuesta = NextResponse.redirect(`${await origenPublico()}/login`, { status: 303 });
  respuesta.cookies.delete({ name: COOKIE_MODO_SIMPLE, path: "/" });
  return respuesta;
}
