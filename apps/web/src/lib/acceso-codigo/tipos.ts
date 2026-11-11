// Sin "server-only": lo importan tanto código de servidor (smtp, login) como
// pantallas que necesitan saber si un email es un placeholder.

/** Dominio NO entregable de las cuentas creadas por código (sin Gmail). */
export const DOMINIO_CUENTA_POR_CODIGO = "usuarios.soyvita.com.ar";

// "Conectar su celular" (código de acceso): 24 h. El diseño dice 7 días; se
// eligió 24 h (decisión del usuario 2026-11-11) porque el código abre la cuenta
// de la persona sin contraseña. Sigue sirviendo una sola vez.
export const MINUTOS_VIGENCIA_CODIGO_ACCESO = 24 * 60;

/** "30 minutos", "1 hora", "24 horas": para textos de vigencia. */
export function textoDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.round(minutos / 60);
  return `${horas} ${horas === 1 ? "hora" : "horas"}`;
}

/** Lo que falta para que venza, redondeado hacia arriba: "12 minutos", "23 horas". */
export function textoRestante(ms: number): string {
  const minutos = Math.max(1, Math.ceil(ms / 60000));
  return minutos < 60 ? textoDuracion(minutos) : textoDuracion(Math.ceil(minutos / 60) * 60);
}

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
  | { ok: false; motivo: "invalido" | "bloqueado" | "error" | "invitacion" };
