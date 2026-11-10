export type RolMensaje = "user" | "assistant";

export type MensajeChat = {
  /** Migración 055; ausente o null en los mensajes sin tarjetas. */
  tarjetas?: unknown;
  id: string;
  sesion_id: string;
  role: RolMensaje;
  contenido: string;
  created_at: string;
};
