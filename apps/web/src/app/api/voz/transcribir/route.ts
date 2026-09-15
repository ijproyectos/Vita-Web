import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribirAudio } from "@/lib/voz/nucleo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const archivo = formData.get("audio");

  if (!(archivo instanceof Blob)) {
    return NextResponse.json({ error: "Falta el audio a transcribir." }, { status: 400 });
  }

  const resultado = await transcribirAudio(archivo, archivo.type || "audio/webm");

  if ("error" in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  return NextResponse.json({ texto: resultado.texto });
}
