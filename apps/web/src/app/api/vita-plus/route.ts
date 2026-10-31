import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { origenPermitido } from "@/lib/vita-plus/logica";
import { vitaPlusConfigurado } from "@/lib/vita-plus/mercadopago";
import {
  cancelarSuscripcionVitaPlus,
  cotizarVitaPlus,
  crearSuscripcionVitaPlus,
  ejercerArrepentimientoVitaPlus,
  obtenerEstadoVitaPlus,
} from "@/lib/vita-plus/nucleo";
import { esPlanVitaPlus } from "@/lib/vita-plus/planes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

function json(cuerpo: Record<string, unknown>, status = 200) {
  return NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
}

// Host público del pedido: detrás de un proxy (Netlify) `request.url` trae el host interno.
function hostPublico(request: Request): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

/**
 * vita+ desde la app (sesión de Supabase, mismo-origen). Una sola entrada con `action`:
 * - cotizar: pesos que se cobrarían por cada plan al dólar oficial de ahora.
 * - crear { plan }: crea la suscripción en Mercado Pago y devuelve `initPoint` + los pesos reales a cobrar.
 * - estado: estado de vita+ de la cuenta (lo consulta la pantalla de gracias).
 * - cancelar: corta los cobros futuros; vita+ sigue hasta lo ya pagado.
 * - arrepentimiento: botón de arrepentimiento (Res. 424/2020), solo dentro de los 10 días del primer cobro:
 *   registra el pedido, cancela en Mercado Pago y avisa a soporte; el reembolso lo procesa una persona.
 * El cliente nunca manda montos: solo la clave del plan. Nunca lanza: siempre responde JSON.
 */
export async function POST(request: Request) {
  if (!origenPermitido(request.headers.get("origin"), hostPublico(request))) {
    return json({ error: "Origen no permitido." }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Formato no soportado." }, 415);
  }

  let cuerpo: { action?: unknown; plan?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Sin sesión." }, 401);

    switch (cuerpo.action) {
      case "estado": {
        const estado = await obtenerEstadoVitaPlus(supabase);
        return json({ habilitado: vitaPlusConfigurado(), estado });
      }
      case "cotizar": {
        const r = await cotizarVitaPlus();
        if (!r.ok) return json({ error: r.mensaje }, 503);
        return json({ cotizacion: r.cotizacion });
      }
      case "crear": {
        if (!esPlanVitaPlus(cuerpo.plan)) return json({ error: "Plan inválido." }, 400);
        const r = await crearSuscripcionVitaPlus(supabase, { id: user.id, email: user.email }, cuerpo.plan);
        if (!r.ok) return json({ error: r.mensaje, codigo: r.codigo }, r.http);
        return json({ initPoint: r.initPoint, pesos: r.pesos, fx: r.fx });
      }
      case "cancelar": {
        const r = await cancelarSuscripcionVitaPlus(supabase, user.id);
        if (!r.ok) return json({ error: r.mensaje }, r.http);
        return json({ ok: true, estado: await obtenerEstadoVitaPlus(supabase) });
      }
      case "arrepentimiento": {
        const r = await ejercerArrepentimientoVitaPlus(supabase, { id: user.id, email: user.email });
        if (!r.ok) return json({ error: r.mensaje }, r.http);
        return json({ ok: true, estado: await obtenerEstadoVitaPlus(supabase) });
      }
      default:
        return json({ error: "Acción inválida." }, 400);
    }
  } catch {
    return json({ error: "No pudimos completar el pedido. Probá de nuevo." }, 500);
  }
}
