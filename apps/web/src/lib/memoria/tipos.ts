// Tipos de la memoria persistente (migración 035). Sin `server-only`: los usa también el cliente.

/** Sobre quién es un recuerdo: la propia persona, un familiar o alguien nombrado a mano. */
export type SobreTipo = "yo" | "familiar" | "otro";
export type TipoMemoria = "estable" | "pasajero";
export type EstadoMemoria = "vigente" | "reemplazado" | "borrado";
export type OrigenMemoria = "chat" | "consolidacion" | "usuario";

export type Memoria = {
  id: string;
  usuario_id: string;
  sobre_tipo: SobreTipo;
  /** Perfil del familiar cuando se sabe. */
  sobre_perfil_id: string | null;
  /** Nombre libre ("Laura") cuando no hay perfil. */
  sobre_nombre: string | null;
  /** Tema estable: misma clave = corregir, no duplicar. */
  clave: string;
  /** Null solo si está borrada (un borrado no conserva el texto). */
  texto: string | null;
  tipo: TipoMemoria;
  /** Pasajeros: vence a los 3 días. */
  vence_at: string | null;
  estado: EstadoMemoria;
  corrige_id: string | null;
  destacado: boolean;
  usos: number;
  origen: OrigenMemoria;
  mensaje_origen_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Vigencia de un recuerdo pasajero, en días. */
export const DIAS_VIGENCIA_PASAJERO = 3;

export type ResumenConversacion = {
  usuario_id: string;
  resumen: string;
  /** Asuntos abiertos de la charla (lista corta de textos). */
  pendientes: string[];
  cubre_hasta_mensaje_id: string | null;
  cubre_hasta_created_at: string | null;
  version: number;
  updated_at: string;
};

export type TipoTareaMemoria = "resumir" | "regenerar" | "consolidar";
export type EstadoTareaMemoria = "pendiente" | "en_curso" | "hecha" | "fallida";

export type TareaMemoria = {
  id: string;
  usuario_id: string;
  tipo: TipoTareaMemoria;
  estado: EstadoTareaMemoria;
  reservada_hasta: string | null;
  intentos: number;
  version_esperada: number | null;
  error: string | null;
  created_at: string;
};

/**
 * Bloques de contenido guardados en `mensajes_chat.bloques`: solo lo que se puede volver a mandar al
 * modelo. Nunca `thinking` / `redacted_thinking`.
 */
export type BloqueTexto = { type: "text"; text: string };
export type BloqueToolUse = { type: "tool_use"; id: string; name: string; input: unknown };
export type BloqueToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type BloqueGuardado = BloqueTexto | BloqueToolUse | BloqueToolResult;

/** Un mensaje de la API dentro de un turno (el asistente, y el "user" que lleva los tool_result). */
export type MensajeBloques = { role: "user" | "assistant"; content: BloqueGuardado[] };

/**
 * Valor de `mensajes_chat.bloques`. Fila del usuario: un solo mensaje `user` con su texto. Fila del
 * asistente: TODOS los mensajes del turno en orden (assistant con tool_use, user con tool_result, ...,
 * assistant final), para poder reconstruir el turno entero.
 */
export type BloquesTurno = MensajeBloques[];
