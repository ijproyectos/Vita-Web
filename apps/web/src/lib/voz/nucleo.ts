import "server-only";

import type { ResultadoTranscripcion } from "./tipos";

// Único punto de contacto con la API de transcripción de OpenAI — mismo
// criterio que lib/estudios/extraer.ts para Anthropic: un solo archivo
// server-only, nunca lanza, quien llama siempre puede degradar (acá,
// dejar que el usuario tipee) si esto falla.
const ENDPOINT_TRANSCRIPCIONES = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Transcribe un turno de audio grabado a texto en español. Nunca lanza:
 * si falta OPENAI_API_KEY, si la API responde con error, o si la request
 * de red falla, devuelve {error} para que el llamador pueda avisarle al
 * usuario y dejarlo tipear en vez de romper el chat.
 */
export async function transcribirAudio(audio: Buffer | Blob, mimeType: string): Promise<ResultadoTranscripcion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: "La transcripción por voz no está disponible en este momento." };
  }

  try {
    const cuerpo = new FormData();
    const blob = audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: mimeType });
    cuerpo.append("file", blob, "turno.webm");
    cuerpo.append("model", "whisper-1");
    cuerpo.append("language", "es");

    const respuesta = await fetch(ENDPOINT_TRANSCRIPCIONES, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: cuerpo,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      return { error: `No se pudo transcribir el audio (${respuesta.status}). ${detalle}`.trim() };
    }

    const datos = (await respuesta.json()) as { text?: string };
    const texto = datos.text?.trim();
    if (!texto) {
      return { error: "No se detectó voz en el audio grabado." };
    }

    return { texto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error de red al transcribir el audio." };
  }
}
