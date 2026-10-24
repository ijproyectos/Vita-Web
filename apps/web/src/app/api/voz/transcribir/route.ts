import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribirAudio } from "@/lib/voz/nucleo";

export const runtime = "nodejs";

// Un turno de voz son segundos de audio; 10 MB es holgado y corta abusos.
const MAX_BYTES_AUDIO = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // Si el cliente declara el tamaño, se corta antes de leer el cuerpo entero.
  const largo = Number(request.headers.get("content-length"));
  if (Number.isFinite(largo) && largo > MAX_BYTES_AUDIO + 64 * 1024) {
    return NextResponse.json({ error: "El audio es demasiado grande (máximo 10 MB)." }, { status: 413 });
  }

  const formData = await request.formData();
  const archivo = formData.get("audio");

  if (!(archivo instanceof Blob)) {
    return NextResponse.json({ error: "Falta el audio a transcribir." }, { status: 400 });
  }

  if (archivo.size > MAX_BYTES_AUDIO) {
    return NextResponse.json({ error: "El audio es demasiado grande (máximo 10 MB)." }, { status: 413 });
  }
  if (archivo.type && !archivo.type.startsWith("audio/")) {
    return NextResponse.json({ error: "El archivo no es un audio." }, { status: 415 });
  }

  const resultado = await transcribirAudio(archivo, archivo.type || "audio/webm");

  if ("error" in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  return NextResponse.json({ texto: resultado.texto });
}
