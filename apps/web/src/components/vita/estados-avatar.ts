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
// + animación CSS sutil (respirar/mecerse), salvo "idle"/"calm" que abajo
// tienen su propio loop de movimiento real (ver CUADROS_IDLE).
export const CUADRO_SPEAKING = ["/vita/speaking-0.webp", "/vita/speaking-1.webp", "/vita/speaking-2.webp"] as const;

// Loop de 30 frames de la animación REAL "neutral" del character sheet
// (breathe+blink+sprout, no una aproximación CSS) — pedido explícito del
// usuario: "tenga movimiento como lo pasamos en las animaciones que te
// pasé". Capturado headless con Puppeteer muestreando 4.8s exactos del
// loop de Three.js (blink() es literalmente periódica en 4.8s, breathe()
// empalma al 99.6%) — ver el comentario de capturar-idle.mjs en el
// scratchpad de generación. "calm" reusa el mismo loop, más lento (ver
// INTERVALO_IDLE_MS_CALM), porque el diseño no define una animación propia
// para ese estado.
export const CUADROS_IDLE = 30;
export const INTERVALO_IDLE_MS = 160; // 30 * 160 = 4800ms, el loop exacto capturado
export const INTERVALO_IDLE_MS_CALM = 260; // mismo loop, más pausado — "calm" no es "idle"

export function assetIdle(cuadro: number): string {
  return `/vita/idle/f${String(cuadro % CUADROS_IDLE).padStart(2, "0")}.webp`;
}

const ASSET_ESTATICO: Record<Exclude<EstadoAvatar, "speaking">, string> = {
  idle: assetIdle(0),
  calm: assetIdle(0),
  listening: "/vita/listening.webp",
  thinking: "/vita/thinking.webp",
  happy: "/vita/happy.webp",
  empathetic: "/vita/empathetic.webp",
  alert: "/vita/alert.webp",
};

export function assetPorEstado(estado: EstadoAvatar, cuadroHabla: 0 | 1 | 2 = 0, cuadroIdle = 0): string {
  if (estado === "speaking") return CUADRO_SPEAKING[cuadroHabla];
  if (estado === "idle" || estado === "calm") return assetIdle(cuadroIdle);
  return ASSET_ESTATICO[estado];
}

// Animación CSS sutil por estado — nombres de @keyframes definidos en
// globals.css (vita-respirar/vita-escuchar/vita-pensar/vita-hablar/
// vita-feliz/vita-alerta). "empathetic" reusa el respirar base, más lento
// — nunca gestos grandes, pedido explícito de "no exagerar". "idle"/"calm"
// van en "none": ya tienen movimiento real propio (el loop de 30 frames,
// ver CUADROS_IDLE) — sumarle además el pulso CSS se veía doble/exagerado.
export const ANIMACION_POR_ESTADO: Record<EstadoAvatar, string> = {
  idle: "none",
  calm: "none",
  listening: "vita-escuchar 2.4s ease-in-out infinite",
  thinking: "vita-pensar 2.8s ease-in-out infinite",
  speaking: "vita-respirar 3.2s ease-in-out infinite",
  happy: "vita-feliz 1.4s ease-in-out infinite",
  empathetic: "vita-respirar 5.6s ease-in-out infinite",
  alert: "vita-alerta 1.1s ease-in-out infinite",
};
