import { NextResponse } from "next/server";
import { LIMITES_VOZ } from "@/lib/limites/logica";
import { verificarLimitePedidos } from "@/lib/limites/nucleo";
import { createClient } from "@/lib/supabase/server";
import { generarAudio } from "@/lib/voz/nucleo";

export const runtime = "nodejs";
// Segundos; literal estático. Alineado con PRESUPUESTO_RESPUESTA_MS (lib/ai/presupuesto.ts): ahí está
// cómo subirlo junto con el timeout de funciones de Netlify.
export const maxDuration = 10;

// Tope de caracteres por pedido. El cliente manda una oración por vez
// (extraerFrasesListas), muy por debajo de esto; evita que se use el endpoint
// para sintetizar texto largo a costa de Deepgram.
const MAX_CARACTERES = 1200;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // Límite de pedidos por usuario (migración 035; falla abierto).
  const pedidos = await verificarLimitePedidos({ usuarioId: user.id, headers: request.headers, limites: LIMITES_VOZ });
  if (!pedidos.ok) {
    return NextResponse.json(
      { error: pedidos.mensaje },
      { status: 429, headers: { "Retry-After": String(pedidos.reintentarEnSegundos) } }
    );
  }

  const { texto } = (await request.json().catch(() => ({}))) as { texto?: string };

  if (!texto?.trim()) {
    return NextResponse.json({ error: "Falta el texto a sintetizar." }, { status: 400 });
  }

  if (texto.length > MAX_CARACTERES) {
    return NextResponse.json(
      { error: `El texto es demasiado largo para leerlo en voz alta (máximo ${MAX_CARACTERES} caracteres).` },
      { status: 413 }
    );
  }

  const resultado = await generarAudio(texto);

  if ("error" in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  return new NextResponse(resultado.audio, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
