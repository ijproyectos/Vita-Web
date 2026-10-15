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
