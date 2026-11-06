export type RolMensaje = "user" | "assistant";

export type MensajeChat = {
  id: string;
  sesion_id: string;
  role: RolMensaje;
  contenido: string;
  created_at: string;
};
