// Estados visuales del avatar de vita — un solo enum centralizado para que
// ningún componente invente sus propios strings de estado (pedido
// explícito: "centralizá los estados... para evitar lógica dispersa").
//
// Los 7 renders (public/vita/*.webp) salen del mismo Three.js del sheet de
// diseño (asistente/Vita character sheet concepts/Vita 03 Estados v2.html)
// — capturados headless (puppeteer) con fondo transparente, no dibujados
// de cero. "calm" reusa el arte de "idle" (mismo diseño no define una
// expresión "calm" separada) con una animación más lenta, ver
// ANIMACION_POR_ESTADO más abajo.
export type EstadoAvatar =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "happy"
  | "empathetic"
  | "calm"
  | "alert";

export const ESTADOS_AVATAR: EstadoAvatar[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "happy",
  "empathetic",
  "calm",
  "alert",
];

// "speaking" tiene 3 frames (boca cerrada/media/abierta) para el lip-sync
// básico — ver useCuadroHabla más abajo. El resto es un solo frame estático
// + animación CSS sutil (respirar/mecerse), no una secuencia.
export const CUADRO_SPEAKING = ["/vita/speaking-0.webp", "/vita/speaking-1.webp", "/vita/speaking-2.webp"] as const;

const ASSET_ESTATICO: Record<Exclude<EstadoAvatar, "speaking">, string> = {
  idle: "/vita/idle.webp",
  calm: "/vita/idle.webp",
  listening: "/vita/listening.webp",
  thinking: "/vita/thinking.webp",
  happy: "/vita/happy.webp",
  empathetic: "/vita/empathetic.webp",
  alert: "/vita/alert.webp",
};

export function assetPorEstado(estado: EstadoAvatar, cuadroHabla: 0 | 1 | 2 = 0): string {
  if (estado === "speaking") return CUADRO_SPEAKING[cuadroHabla];
  return ASSET_ESTATICO[estado];
}

// Animación CSS sutil por estado — nombres de @keyframes definidos en
// globals.css (vita-respirar/vita-escuchar/vita-pensar/vita-hablar/
// vita-feliz/vita-alerta). "calm"/"empathetic" reusan el respirar base,
// más lento — nunca gestos grandes, pedido explícito de "no exagerar".
export const ANIMACION_POR_ESTADO: Record<EstadoAvatar, string> = {
  idle: "vita-respirar 4.2s ease-in-out infinite",
  calm: "vita-respirar 5.6s ease-in-out infinite",
  listening: "vita-escuchar 2.4s ease-in-out infinite",
  thinking: "vita-pensar 2.8s ease-in-out infinite",
  speaking: "vita-respirar 3.2s ease-in-out infinite",
  happy: "vita-feliz 1.4s ease-in-out infinite",
  empathetic: "vita-respirar 5.6s ease-in-out infinite",
  alert: "vita-alerta 1.1s ease-in-out infinite",
};
