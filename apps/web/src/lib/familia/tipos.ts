// Tipos del dominio Familia (ver supabase/migrations/021_familia.sql). Sin
// "server-only": los consumen también componentes de cliente (selector).

/** Claves de paleta que acepta `perfiles.color` (check de la DB). */
export const COLORES_PERFIL = ["teal", "violeta", "ambar", "rosa", "azul"] as const;
export type ColorPerfil = (typeof COLORES_PERFIL)[number];

export function esColorPerfil(valor: unknown): valor is ColorPerfil {
  return typeof valor === "string" && (COLORES_PERFIL as readonly string[]).includes(valor);
}

/** Qué puede hacer el CUIDADOR sobre los datos de la persona (vinculos_cuidador.rol). */
export type RolVinculo = "editar" | "ver";

export function esRolVinculo(valor: unknown): valor is RolVinculo {
  return valor === "editar" || valor === "ver";
}

export const ETIQUETA_ROL: Record<RolVinculo, { titulo: string; sub: string }> = {
  editar: { titulo: "Admin", sub: "Ve y edita todo: remedios, turnos y salud." },
  ver: { titulo: "Lector", sub: "Ve remedios, turnos y salud. No cambia nada." },
};

/** Persona que el usuario logueado cuida (RPC `listar_familia`). */
export type MiembroFamilia = {
  vinculoId: string;
  id: string;
  nombre: string;
  color: ColorPerfil | null;
  rol: RolVinculo;
  relacion: string | null;
  /** La cuenta ya inició sesión alguna vez (usa su celular). */
  conectado: boolean;
};

/** Alguien que cuida al usuario logueado (RPC `listar_mis_cuidadores`). */
export type MiCuidador = {
  vinculoId: string;
  cuidadorId: string;
  nombre: string;
  rol: RolVinculo;
  relacion: string | null;
};

/**
 * Cuidador (aceptado) o invitación pendiente de una persona
 * (RPC `listar_cuidadores_de`, migración 027).
 */
export type CuidadorDePersona = {
  vinculoId: string;
  cuidadorId: string | null;
  nombre: string;
  rol: RolVinculo;
  relacion: string | null;
  estado: "aceptado" | "pendiente";
  /** Soy yo (el usuario logueado). */
  esYo: boolean;
  /** Puedo invitar, cambiar permisos y quitar (solo la propia persona o un Admin de un perfil gestionado). */
  puedeGestionar: boolean;
  /** Solo para quien puede gestionar. */
  email: string | null;
  /** Token de la invitación pendiente (solo para quien puede gestionar). */
  token: string | null;
  expiraAt: string | null;
  aceptadoAt: string | null;
};

export const RELACIONES_CUIDADOR = ["Hermana", "Hermano", "Hijo/a", "Pareja", "Nieto/a", "Otro"] as const;

/** Perfil sobre el que se está mirando/cargando en /app/* (cookie `vita_perfil`). */
export type PerfilActivo = {
  id: string;
  nombre: string;
  color: ColorPerfil;
  esPropio: boolean;
  /** Para el propio perfil siempre "editar". */
  rol: RolVinculo;
};

/** Estado de hoy de un perfil, para la línea de estado del selector. */
export type EstadoHoyPerfil = {
  tomadas: number;
  total: number;
  /** Primera dosis de hoy ya pasada de hora y sin marcar. */
  vencida: { nombre: string; hora: string } | null;
};

/** Opción del selector de perfiles (bottom sheet). */
export type OpcionPerfil = {
  id: string;
  nombre: string;
  color: ColorPerfil;
  sub: string;
  esPropio: boolean;
  /** Se omite si no se pudo calcular (el selector cae a `sub`). */
  estado?: EstadoHoyPerfil;
};

export const RELACIONES_SUGERIDAS = ["Mamá", "Papá", "Abuela/o", "Pareja", "Hijo/a", "Otro"] as const;

export type ResultadoFamilia = { status: "success" } | { status: "error"; message: string };

export type ResultadoCrearPerfil = { status: "success"; id: string } | { status: "error"; message: string };
