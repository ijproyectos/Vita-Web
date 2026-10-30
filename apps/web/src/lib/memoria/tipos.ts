// Tipos de la memoria persistente (migración 038). Sin `server-only`: los usa también el cliente.

/** Sobre quién es un recuerdo: la propia persona, un familiar o alguien nombrado a mano. */
export type SobreTipo = "yo" | "familiar" | "otro";
export type TipoMemoria = "estable" | "pasajero";
export type EstadoMemoria = "vigente" | "reemplazado" | "borrado";
export type OrigenMemoria = "chat" | "usuario";

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
