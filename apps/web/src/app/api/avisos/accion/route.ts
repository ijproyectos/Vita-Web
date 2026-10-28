import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { marcarTomado } from "@/lib/medicamentos/nucleo";
import { posponerDosis } from "@/lib/notificaciones/avisos";
import { validarFechaAccion } from "@/lib/notificaciones/fecha-accion";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Botones de la notificación push ("Ya la tomé" / "En 15 min"). Los dispara
 * public/sw.js con `fetch(..., { credentials: "include" })`: viaja la cookie
 * de sesión de Supabase, así que esto corre con el cliente de SESIÓN (RLS) y
 * nunca con el admin. Sin sesión devuelve 401 y el service worker abre la app
 * en la pantalla de la dosis. Mismo-origen obligatorio (el service worker
 * siempre manda `Origin`): un POST cross-site con la cookie no pasa.
 *
 * No usa `requireUser()` porque éste redirige a /login (una redirección no
 * sirve de respuesta a un fetch del service worker).
 */
// Host público del pedido. `request.url` no sirve: detrás de un proxy (Netlify)
// o con el server escuchando en 0.0.0.0 trae el host interno, y un POST
// legítimo del service worker quedaba rechazado con 403.
function hostPublico(request: Request): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

export async function POST(request: Request) {
  const origen = request.headers.get("origin");
  if (origen) {
    let hostOrigen: string | null = null;
    try {
      hostOrigen = new URL(origen).host;
    } catch {
      hostOrigen = null;
    }
    if (!hostOrigen || hostOrigen !== hostPublico(request)) {
      return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
    }
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato no soportado." }, { status: 415 });
  }

  let cuerpo: { medicamentoId?: unknown; accion?: unknown; fecha?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const { medicamentoId, accion, fecha } = cuerpo;
  if (typeof medicamentoId !== "string" || !UUID.test(medicamentoId) || (accion !== "tomada" && accion !== "posponer")) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  // La fecha de la dosis viaja en la notificación: una notificación vieja (o sin
  // fecha) nunca marca ni pospone la dosis de HOY. Responde 409 y el service
  // worker abre la app para resolverlo ahí.
  const validacion = validarFechaAccion(accion, fecha, new Date());
  if (!validacion.ok) {
    return NextResponse.json({ error: "Esta notificación ya no corresponde a una dosis pendiente." }, { status: 409 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

    // La RLS de `medicamentos` también deja leer los del elder a su cuidador:
    // acá solo vale la dosis PROPIA.
    const { data: propia, error: errorPropia } = await supabase
      .from("medicamentos")
      .select("id")
      .eq("id", medicamentoId)
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (errorPropia) return NextResponse.json({ error: "No pudimos verificar la dosis." }, { status: 500 });
    if (!propia) return NextResponse.json({ error: "Dosis no encontrada." }, { status: 404 });

    if (accion === "tomada") {
      // marcarTomado devuelve void y LANZA ante cualquier error de DB: el catch
      // de abajo responde 500, así el service worker nunca muestra "Listo".
      await marcarTomado(supabase, user.id, medicamentoId, true, validacion.fecha);
    } else {
      const r = await posponerDosis(supabase, user.id, [medicamentoId]);
      if (!r.ok) return NextResponse.json({ error: "No pudimos programar el aviso." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "No pudimos registrar la acción." }, { status: 500 });
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/modo-simple");
  return NextResponse.json({ ok: true });
}
