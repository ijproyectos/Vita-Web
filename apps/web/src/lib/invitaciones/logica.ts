// Reglas puras de la invitación de cuidador.

export const MINUTOS_CODIGO_MAIL = 10;

/** El mail escrito es el invitado (sin importar mayúsculas ni espacios). */
export function mailCoincide(invitado: string, escrito: unknown): boolean {
  return typeof escrito === "string" && escrito.trim().toLowerCase() === invitado.trim().toLowerCase();
}

export function esCodigoSeis(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{6}$/.test(valor);
}

/**
 * Quien ya tenía vita sigue en su inicio, salvo un Lector, que solo tiene la
 * vista de mirar. Quien recién llega abre directo a la persona que va a cuidar.
 */
export function abreEnLaPersona(rol: "editar" | "ver", yaTeniaPerfil: boolean): boolean {
  return rol === "ver" || !yaTeniaPerfil;
}

/** Texto del aviso a quien invitó. Si invitó la propia persona: "ya te cuida". */
export function textoInvitacionAceptada(args: { cuidador: string; persona: string; invitoLaPersona: boolean }): { titulo: string; cuerpo: string } {
  return {
    titulo: args.invitoLaPersona ? `${args.cuidador} ya te cuida` : `${args.cuidador} ya cuida a ${args.persona}`,
    cuerpo: "Aceptó la invitación.",
  };
}
