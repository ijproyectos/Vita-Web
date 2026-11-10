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

// Pantallas a las que se puede llegar con el modo simple activo. Cualquier
// otra ruta de /app (un aviso del celular que abre Rutina, Mis pastillas,
// Avisos…) vuelve al modo simple: la persona nunca cae en la app normal sin
// haber tocado "Salir del modo simple". `/app` queda libre porque ya decide
// solo (`destinoDeInicio`).
const RUTAS_MODO_SIMPLE_EXACTAS = ["/app", "/app/mi-salud/monitoreo/agregar", "/app/perfil/contacto-emergencia"];
const RUTAS_MODO_SIMPLE_CON_SUBRUTAS = ["/app/modo-simple"];

export function rutaPermitidaModoSimple(pathname: string): boolean {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (ruta !== "/app" && !ruta.startsWith("/app/")) return true;
  if (RUTAS_MODO_SIMPLE_EXACTAS.includes(ruta)) return true;
  return RUTAS_MODO_SIMPLE_CON_SUBRUTAS.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

/** Opciones para que el SERVIDOR renueve la cookie (Safari limita a 7 días las que escribe la página). */
export const OPCIONES_COOKIE_MODO_SIMPLE = { path: "/", maxAge: UN_ANIO_S, sameSite: "lax" as const, httpOnly: false };
