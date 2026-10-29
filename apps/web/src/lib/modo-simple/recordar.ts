// "Modo simple activo" por dispositivo: mientras esta cookie exista, abrir la
// app (start_url = /app) vuelve directo al modo simple en vez del Inicio
// normal. No es un dato sensible ni una autorización (solo decide qué pantalla
// se muestra primero), por eso la escribe el cliente y no es httpOnly. Se
// borra solo con "Salir del modo simple" o al cerrar sesión.
export const COOKIE_MODO_SIMPLE = "vita_modo_simple";

const UN_ANIO_S = 60 * 60 * 24 * 365;

export function recordarModoSimple() {
  document.cookie = `${COOKIE_MODO_SIMPLE}=1; path=/; max-age=${UN_ANIO_S}; samesite=lax`;
}

export function olvidarModoSimple() {
  document.cookie = `${COOKIE_MODO_SIMPLE}=; path=/; max-age=0; samesite=lax`;
}
