// Estados visuales del avatar de vita — un solo enum centralizado para que
// ningún componente invente sus propios strings de estado. El mapeo a los 4
// moods del personaje 3D (alegre/triste/enojo/seguimiento) vive en
// vita-3d/mapeo-estado.ts. "typing" = el usuario está escribiendo en el chat.
export type EstadoAvatar =
  | "idle"
  | "listening"
  | "thinking"
  | "typing"
  | "speaking"
  | "happy"
  | "empathetic"
  | "calm"
  | "alert";

export const ESTADOS_AVATAR: EstadoAvatar[] = [
  "idle",
  "listening",
  "thinking",
  "typing",
  "speaking",
  "happy",
  "empathetic",
  "calm",
  "alert",
];
