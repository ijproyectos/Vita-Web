import "server-only";

import type { ResultadoAudio, ResultadoTranscripcion } from "./tipos";

// Único punto de contacto con la API de transcripción de Groq (endpoint
// compatible con el formato de OpenAI, mismo modelo Whisper por debajo) —
// se usa Groq y no OpenAI directo porque su free tier no pide tarjeta.
// Mismo criterio que lib/estudios/extraer.ts para Anthropic: un solo
// archivo server-only, nunca lanza, quien llama siempre puede degradar
// (acá, dejar que el usuario tipee) si esto falla.
const ENDPOINT_TRANSCRIPCIONES = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Transcribe un turno de audio grabado a texto en español. Nunca lanza:
 * si falta GROQ_API_KEY, si la API responde con error, o si la request
 * de red falla, devuelve {error} para que el llamador pueda avisarle al
 * usuario y dejarlo tipear en vez de romper el chat.
 */
export async function transcribirAudio(audio: Buffer | Blob, mimeType: string): Promise<ResultadoTranscripcion> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { error: "La transcripción por voz no está disponible en este momento." };
  }

  try {
    const cuerpo = new FormData();
    const blob = audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: mimeType });
    cuerpo.append("file", blob, "turno.webm");
    cuerpo.append("model", "whisper-large-v3-turbo");
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

// Voz elegida para vita: femenina, acento argentino (es-AR) — pedido
// explícito del usuario, no mexicana. Confirmado contra GET /v1/models de
// Deepgram (no contra la doc genérica): de las 17 voces en español del
// catálogo Aura-2, aura-2-antonia-es es la única con accent="Argentine".
const MODELO_VOZ_VITA = "aura-2-antonia-es";
const ENDPOINT_VOZ = `https://api.deepgram.com/v1/speak?model=${MODELO_VOZ_VITA}`;

// El chat de vita usa emojis en el texto (ej. el saludo inicial "Hola 👋").
// Sin filtrarlos, el motor de TTS los pronuncia como palabras ("emoji de
// mano saludando") — se sacan solo acá, antes de sintetizar, sin tocar el
// texto que se ve en la burbuja del chat.
function quitarEmojis(texto: string): string {
  return texto
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[‍️]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Sintetiza la respuesta de vita a audio (mp3) con Deepgram Aura-2. Nunca
 * lanza, mismo criterio que transcribirAudio: si falta DEEPGRAM_API_KEY o
 * la API falla, devuelve {error} y quien llama simplemente no reproduce
 * nada — el chat de texto ya mostró la respuesta, no hay nada que romper.
 */
export async function generarAudio(texto: string): Promise<ResultadoAudio> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return { error: "La voz de vita no está disponible en este momento." };
  }

  const limpio = quitarEmojis(texto);
  if (!limpio) {
    return { error: "No hay texto para sintetizar." };
  }

  try {
    const respuesta = await fetch(ENDPOINT_VOZ, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: limpio }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      return { error: `No se pudo generar el audio (${respuesta.status}). ${detalle}`.trim() };
    }

    return { audio: await respuesta.arrayBuffer() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error de red al generar el audio." };
  }
}
