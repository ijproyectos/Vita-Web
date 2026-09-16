import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarAudio } from "@/lib/voz/nucleo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { texto } = (await request.json().catch(() => ({}))) as { texto?: string };

  if (!texto?.trim()) {
    return NextResponse.json({ error: "Falta el texto a sintetizar." }, { status: 400 });
  }

  const resultado = await generarAudio(texto);

  if ("error" in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  return new NextResponse(resultado.audio, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
