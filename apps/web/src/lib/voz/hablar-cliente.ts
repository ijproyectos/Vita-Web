"use client";

// Reproduce la respuesta de vita con la voz sintética generada por
// /api/voz/hablar (Deepgram Aura-2) en vez de la voz de sistema del
// navegador (window.speechSynthesis) — pedido explícito del usuario: la voz
// del navegador suena robótica, sin las pausas/entonación de una voz real.
// Nunca rechaza la promesa ni lanza: si falla la síntesis o la reproducción,
// el chat de texto ya mostró la respuesta, no hay nada que romper.

// WAV de un sample en silencio — un audio real pero inaudible, suficiente
// para "desbloquear" <audio>.play() en Safari/iOS, donde la reproducción
// programática está bloqueada si no ocurre dentro del mismo gesto
// sincrónico del usuario (mismo problema que tenía speechSynthesis, pero
// <audio> y speechSynthesis son dos flags de desbloqueo independientes en
// WebKit, así que no alcanza con haber desbloqueado uno para el otro).
const AUDIO_SILENCIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let audioActual: HTMLAudioElement | null = null;

export function desbloquearVoz(): void {
  if (typeof window === "undefined") return;
  const audio = new Audio(AUDIO_SILENCIO);
  audio.play().catch(() => {});
}

export function cancelarVoz(): void {
  audioActual?.pause();
  audioActual = null;
}

export async function hablarTexto(texto: string): Promise<void> {
  if (typeof window === "undefined" || !texto.trim()) return;

  cancelarVoz();

  try {
    const respuesta = await fetch("/api/voz/hablar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!respuesta.ok) return;

    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioActual = audio;

    await new Promise<void>((resolve) => {
      const terminar = () => {
        URL.revokeObjectURL(url);
        if (audioActual === audio) audioActual = null;
        resolve();
      };
      audio.onended = terminar;
      audio.onerror = terminar;
      audio.play().catch(terminar);
    });
  } catch {
    // Degradación silenciosa: la respuesta de texto ya está en pantalla.
  }
}
