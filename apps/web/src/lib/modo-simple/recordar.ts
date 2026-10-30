// "Modo simple activo" por dispositivo: mientras esta cookie exista, abrir la
// app (start_url = /app) vuelve directo al modo simple en vez del Inicio
// normal. No es un dato sensible ni una autorización (solo decide qué pantalla
// se muestra primero), por eso la escribe el cliente y no es httpOnly. Guarda
// el id de quien lo activó: si en el mismo dispositivo entra otra cuenta (p.
// ej. se venció la sesión sin cerrar sesión), esa cuenta no hereda el modo
// simple. Se borra con "Salir del modo simple" o al cerrar sesión.
export const COOKIE_MODO_SIMPLE = "vita_modo_simple";

const UN_ANIO_S = 60 * 60 * 24 * 365;

export function cookieRecordarModoSimple(usuarioId: string): string {
  return `${COOKIE_MODO_SIMPLE}=${encodeURIComponent(usuarioId)}; path=/; max-age=${UN_ANIO_S}; samesite=lax`;
}

export function cookieOlvidarModoSimple(): string {
  return `${COOKIE_MODO_SIMPLE}=; path=/; max-age=0; samesite=lax`;
}

/** El modo simple está activo para esta cuenta solo si lo activó ella. */
export function modoSimpleActivoPara(valorCookie: string | undefined, usuarioId: string): boolean {
  return !!valorCookie && valorCookie === usuarioId;
}

export function recordarModoSimple(usuarioId: string) {
  document.cookie = cookieRecordarModoSimple(usuarioId);
}

export function olvidarModoSimple() {
  document.cookie = cookieOlvidarModoSimple();
}
