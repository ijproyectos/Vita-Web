// Sin "server-only": lo importan tanto código de servidor (smtp, login) como
// pantallas que necesitan saber si un email es un placeholder.

/** Dominio NO entregable de las cuentas creadas por código (sin Gmail). */
export const DOMINIO_CUENTA_POR_CODIGO = "usuarios.soyvita.com.ar";

export const MINUTOS_VIGENCIA_CODIGO_ACCESO = 15;

/** True si el email es el placeholder de una cuenta creada por código. */
export function esEmailDeCuentaPorCodigo(email: string | null | undefined): boolean {
  return Boolean(email) && email!.trim().toLowerCase().endsWith(`@${DOMINIO_CUENTA_POR_CODIGO}`);
}

export type ResultadoEntrarConCodigo = { ok: true } | { ok: false; motivo: "invalido" | "bloqueado" | "error" };

export type ResultadoCodigoAcceso =
  | { status: "success"; codigo: string; expiraAt: string }
  | { status: "error"; message: string };

/** Vista previa de un código válido (sin consumirlo): para el "¿Sos vos?". */
export type VistaPreviaCodigo = {
  /** Nombre completo de la persona del perfil, tal como lo cargó su cuidador. */
  nombreCompleto: string;
  /** Primer nombre. */
  nombre: string;
  /** Primer nombre de quien la cuida, si se conoce. */
  cuidador: string | null;
  /** Medicamentos ya cargados en el borrador (solo código de vínculo). */
  medicamentos: number | null;
};

export type ResultadoVerCodigo =
  | { ok: true; vista: VistaPreviaCodigo }
  | { ok: false; motivo: "invalido" | "bloqueado" | "error" };
