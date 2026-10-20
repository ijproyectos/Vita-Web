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

/** Perfil sobre el que se está mirando/cargando en /app/* (cookie `vita_perfil`). */
export type PerfilActivo = {
  id: string;
  nombre: string;
  color: ColorPerfil;
  esPropio: boolean;
  /** Para el propio perfil siempre "editar". */
  rol: RolVinculo;
};

/** Opción del selector de perfiles (bottom sheet). */
export type OpcionPerfil = {
  id: string;
  nombre: string;
  color: ColorPerfil;
  sub: string;
  esPropio: boolean;
};

export const RELACIONES_SUGERIDAS = ["Mamá", "Papá", "Abuela/o", "Pareja", "Hijo/a", "Otro"] as const;

export type ResultadoFamilia = { status: "success" } | { status: "error"; message: string };

export type ResultadoCrearPerfil = { status: "success"; id: string } | { status: "error"; message: string };
