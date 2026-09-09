export type RolMensaje = "user" | "assistant";

export type MensajeChat = {
  id: string;
  sesion_id: string;
  role: RolMensaje;
  contenido: string;
  created_at: string;
};

export type SesionChat = {
  id: string;
  created_at: string;
  updated_at: string;
  ultimoMensaje: string | null;
};
