"use client";

// Reproduce la respuesta de vita con la voz sintética generada por
// /api/voz/hablar (Deepgram Aura-2) en vez de la voz de sistema del
// navegador. Diseñado para hablar POR ORACIÓN a medida que el streaming de
// texto va llegando (ver vita-chat-overlay.tsx, que llama a
// extraerFrasesListas() en cada chunk) — no espera a que vita termine de
// escribir toda la respuesta antes de arrancar: pedido explícito del
// usuario, que sonaba "trabada" esperando el bloque entero y no empezaba a
// responder hasta bastante después de que aparecía el texto. El fetch de
// cada oración se dispara apenas se detecta completa, en paralelo a la
// reproducción de la anterior, para minimizar el silencio entre frases.
// Nunca rechaza ninguna promesa ni lanza: si falla la síntesis o la
// reproducción de una frase, el chat de texto ya la mostró, no hay nada que
// romper — simplemente esa frase no se escucha.

// WAV de un sample en silencio — un audio real pero inaudible, suficiente
// para "desbloquear" <audio>.play() en Safari/iOS, donde la reproducción
// programática está bloqueada si no ocurre dentro del mismo gesto
// sincrónico del usuario (mismo problema que tenía speechSynthesis, pero
// <audio> y speechSynthesis son dos flags de desbloqueo independientes en
// WebKit, así que no alcanza con haber desbloqueado uno para el otro).
const AUDIO_SILENCIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let audioActual: HTMLAudioElement | null = null;
let resolverActual: (() => void) | null = null;

// Analizador de amplitud del audio de SALIDA (lo que vita dice), para el
// lip-sync básico del avatar (VitaAvatar, ver estados-avatar.ts) — mismo
// principio que el análisis de amplitud que ya hace useGrabacionVoz sobre
// el micrófono, acá aplicado al <audio> que reproduce la respuesta.
// AudioContext separado del de la grabación (son streams distintos,
// entrada vs. salida) — se crea una sola vez y se reusa.
let audioCtx: AudioContext | null = null;
let elementoConAnalizador: HTMLAudioElement | null = null;
let analizadorActual: AnalyserNode | null = null;

/**
 * Devuelve un AnalyserNode enganchado al `<audio>` que está sonando ahora
 * mismo (o null si no hay nada reproduciéndose). `createMediaElementSource`
 * solo se puede llamar UNA vez por elemento — por eso se cachea por
 * elemento, no globalmente: cada frase de reproducirBlob() crea un
 * `<audio>` nuevo. Reconecta a `destination` explícito, si no la salida
 * quedaría muda (crear el source node redirige el audio por el grafo de
 * Web Audio).
 */
export function obtenerAnalizadorDeVoz(): AnalyserNode | null {
  if (typeof window === "undefined" || !audioActual) return null;
  if (elementoConAnalizador === audioActual && analizadorActual) return analizadorActual;

  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const source = audioCtx.createMediaElementSource(audioActual);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    elementoConAnalizador = audioActual;
    analizadorActual = analyser;
    return analyser;
  } catch {
    // Un elemento ya conectado en otro contexto, Web Audio no disponible,
    // etc. — el lip-sync es un detalle visual, nunca debe romper la
    // reproducción real de la voz.
    return null;
  }
}

export function desbloquearVoz(): void {
  if (typeof window === "undefined") return;
  const audio = new Audio(AUDIO_SILENCIO);
  audio.play().catch(() => {});
}

/**
 * Corta lo que se esté reproduciendo ahora mismo. Si hay una reproducción
 * en curso (dentro de reproducirBlob), resuelve su promesa de inmediato en
 * vez de dejarla esperando un onended/onerror que un simple .pause() nunca
 * dispara — si no, quien esté esperando la cola de habla se quedaría
 * colgado para siempre.
 */
export function cancelarVoz(): void {
  audioActual?.pause();
  audioActual = null;
  if (resolverActual) {
    const terminar = resolverActual;
    resolverActual = null;
    terminar();
  }
}

/** Pide el audio de una frase a /api/voz/hablar. Nunca lanza: null si falla. */
export async function obtenerAudioBlob(texto: string): Promise<Blob | null> {
  if (!texto.trim()) return null;
  try {
    const respuesta = await fetch("/api/voz/hablar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!respuesta.ok) return null;
    return await respuesta.blob();
  } catch {
    return null;
  }
}

/** Reproduce un blob ya obtenido y espera a que termine. Nunca lanza. */
export async function reproducirBlob(blob: Blob | null): Promise<void> {
  if (typeof window === "undefined" || !blob) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioActual = audio;

  await new Promise<void>((resolve) => {
    const terminar = () => {
      URL.revokeObjectURL(url);
      if (audioActual === audio) audioActual = null;
      if (resolverActual === terminar) resolverActual = null;
      resolve();
    };
    resolverActual = terminar;
    audio.onended = terminar;
    audio.onerror = terminar;
    audio.play().catch(terminar);
  });
}

// Corta oraciones completas (terminadas en . ! ? …, con comillas/paréntesis
// de cierre opcionales) desde `desdeIndice` en adelante. El resto, sin
// puntuación de cierre todavía, queda sin tocar para la próxima llamada —
// se vuelve a llamar en cada chunk del streaming con el mismo `texto` (que
// va creciendo) y el `hastaIndice` de la llamada anterior.
const TERMINADOR_FRASE = /[.!?…]+["')\]]*\s+/g;

export function extraerFrasesListas(texto: string, desdeIndice: number): { frases: string[]; hastaIndice: number } {
  const resto = texto.slice(desdeIndice);
  const frases: string[] = [];
  let ultimoCorte = 0;
  TERMINADOR_FRASE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TERMINADOR_FRASE.exec(resto))) {
    const frase = resto.slice(ultimoCorte, m.index + m[0].length).trim();
    if (frase) frases.push(frase);
    ultimoCorte = TERMINADOR_FRASE.lastIndex;
  }
  return { frases, hastaIndice: desdeIndice + ultimoCorte };
}
