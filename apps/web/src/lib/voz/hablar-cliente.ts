"use client";

// Envuelve window.speechSynthesis para el modo voz del chat con vita.
// Nunca rechaza la promesa: un glitch de TTS (voz no encontrada, error
// del motor, browser sin soporte) no debe frenar el loop de la
// conversación — el peor caso es simplemente no escuchar la respuesta.

function elegirVozEspanol(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voces.find((v) => v.lang?.toLowerCase() === "es-ar") ??
    voces.find((v) => v.lang?.toLowerCase() === "es-es") ??
    voces.find((v) => v.lang?.toLowerCase().startsWith("es")) ??
    undefined
  );
}

function obtenerVoces(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voces = window.speechSynthesis.getVoices();
    if (voces.length > 0) {
      resolve(voces);
      return;
    }
    // Las voces pueden cargar de forma asincrónica la primera vez —
    // esperamos el evento, con un timeout corto como red de seguridad si
    // el navegador nunca lo dispara.
    const manejarCambio = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", manejarCambio);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", manejarCambio);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", manejarCambio);
      resolve(window.speechSynthesis.getVoices());
    }, 500);
  });
}

// Safari/iOS bloquea en silencio (sin onerror) cualquier speechSynthesis.speak()
// que no ocurra dentro del mismo gesto sincrónico del usuario (un tap). Nuestro
// flujo real llama a speak() varios pasos async después del tap al micrófono
// (transcribir → mandar a vita → recién ahí hablar), así que se "desbloquea"
// el motor acá, en el mismo click que activa el modo voz — una utterance
// vacía alcanza para que el navegador habilite el resto de la sesión.
export function desbloquearVoz(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export async function hablarTexto(texto: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !texto.trim()) {
    return;
  }

  window.speechSynthesis.cancel();

  const voces = await obtenerVoces();
  const vozEspanol = elegirVozEspanol(voces);

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(texto);
    if (vozEspanol) utterance.voice = vozEspanol;
    utterance.lang = vozEspanol?.lang ?? "es-AR";
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}
