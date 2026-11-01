// Validación del formulario "Enviar notificación" del detalle de usuario (panel). Módulo puro.

export const TITULO_PUSH_MAX = 60;
export const CUERPO_PUSH_MAX = 180;
export const PUSH_MAX_POR_HORA = 10;

export type MensajePush = { titulo: string; cuerpo: string };

export function validarMensajePush(crudo: { titulo: unknown; cuerpo: unknown }): { ok: true; mensaje: MensajePush } | { ok: false; error: string } {
  const titulo = typeof crudo.titulo === "string" ? crudo.titulo.trim() : "";
  const cuerpo = typeof crudo.cuerpo === "string" ? crudo.cuerpo.trim() : "";
  if (titulo === "") return { ok: false, error: "Escribí un título." };
  if (titulo.length > TITULO_PUSH_MAX) return { ok: false, error: `El título admite hasta ${TITULO_PUSH_MAX} caracteres.` };
  if (cuerpo === "") return { ok: false, error: "Escribí el mensaje." };
  if (cuerpo.length > CUERPO_PUSH_MAX) return { ok: false, error: `El mensaje admite hasta ${CUERPO_PUSH_MAX} caracteres.` };
  return { ok: true, mensaje: { titulo, cuerpo } };
}

/** `cuenta` = envíos de la hora INCLUIDO el actual (incremento atómico con `contar_pedido` y después chequeo). */
export function superaLimitePush(cuenta: number): boolean {
  return cuenta > PUSH_MAX_POR_HORA;
}

const MS_HORA = 3_600_000;

/** Comienzo de la ventana fija de una hora (UTC) para `limites_pedidos`. */
export function inicioVentanaPush(ahoraMs: number): Date {
  return new Date(Math.floor(ahoraMs / MS_HORA) * MS_HORA);
}

export function clavePush(adminEmail: string): string {
  return `admin-push:${adminEmail.trim().toLowerCase()}:hora`;
}
