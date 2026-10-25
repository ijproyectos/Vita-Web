import type { BloquesTurno } from "@/lib/memoria/tipos";

export type RolMensaje = "user" | "assistant";

export type MensajeChat = {
  id: string;
  /** Null en mensajes del hilo único nuevos que no cuelgan de una sesión (hoy se sigue escribiendo una). */
  sesion_id: string | null;
  role: RolMensaje;
  contenido: string;
  created_at: string;
  // Columnas de la migración 035: faltan hasta aplicarla.
  bloques?: BloquesTurno | null;
  tokens?: number | null;
  pedido_id?: string | null;
  excluido_memoria?: boolean;
};

/** Lo que el overlay necesita de un mensaje del hilo. */
export type MensajeHilo = {
  id: string;
  role: RolMensaje;
  contenido: string;
  created_at: string;
};

/** Una página del hilo, ascendente; `hayMas` = hay mensajes más viejos. */
export type PaginaHilo = { mensajes: MensajeHilo[]; hayMas: boolean };
