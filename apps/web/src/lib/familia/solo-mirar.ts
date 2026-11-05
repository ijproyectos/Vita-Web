import type { CuidadorDePersona } from "./tipos";

// Quién gestiona a la persona que un Lector está mirando. Solo se nombra
// cuando hay EXACTAMENTE un Admin visible; con cero o varios no se adivina.
export function unicoAdmin(cuidadores: CuidadorDePersona[] | null): string | null {
  if (!cuidadores) return null;
  const admins = cuidadores.filter((c) => c.estado === "aceptado" && c.rol === "editar" && !c.esYo);
  if (admins.length !== 1) return null;
  const nombre = admins[0].nombre.trim();
  if (!nombre || nombre === "Sin nombre") return null;
  return nombre.split(/\s+/)[0];
}

/**
 * Qué pasa con la persona si el usuario deja de cuidarla. "sin-certeza" cubre no
 * haber podido leer los cuidadores y que nadie más la cuide pero ella use su
 * celular: ahí no se puede prometer que otros la siguen viendo.
 */
export function alDejarDeCuidar(cuidadores: CuidadorDePersona[] | null, usaSuCelular: boolean | null): "quedan-otros" | "ultimo" | "sin-certeza" {
  if (!cuidadores) return "sin-certeza";
  if (cuidadores.some((c) => c.estado === "aceptado" && !c.esYo)) return "quedan-otros";
  return usaSuCelular === false ? "ultimo" : "sin-certeza";
}

/** Lector mirando el perfil de otra persona: vista "solo mirar" (sin menú ni acciones). */
export function esVistaSoloMirar(activo: { esPropio: boolean; rol: string }): boolean {
  return !activo.esPropio && activo.rol === "ver";
}

// Rutas que un Lector puede abrir mientras mira a otra persona. Son las del
// inicio "solo mirar", su hoja de ajustes y lo que cuelga de ellas: actúan
// sobre la cuenta propia o son de solo lectura. Todo lo demás (rutina, mi
// salud, edición de perfil, medicamentos, turnos, pastillas, altas) vuelve al
// inicio. Es solo navegación: los datos los protegen la RLS y las acciones.
const RUTAS_EXACTAS_SOLO_MIRAR = ["/app", "/app/resumen-salud"];
const RUTAS_CON_SUBRUTAS_SOLO_MIRAR = [
  "/app/avisos",
  "/app/perfil/seguridad",
  "/app/perfil/privacidad",
  "/app/perfil/ayuda",
  // Colgadas de Privacidad y de la hoja de ajustes (cuenta propia).
  "/app/perfil/historial",
  "/app/perfil/compartir",
  "/app/perfil/eliminar-cuenta",
  // El inicio redirige ahí si el modo simple propio está activo (si no, bucle).
  "/app/modo-simple",
  // "Agregar a alguien" del selector de perfiles.
  "/app/familia",
  "/app/vita-plus",
];

/** ¿Puede un Lector abrir esta ruta? Compara por segmentos: `/app/avisos-x` no es `/app/avisos`. */
export function rutaPermitidaSoloMirar(pathname: string): boolean {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (RUTAS_EXACTAS_SOLO_MIRAR.includes(ruta)) return true;
  return RUTAS_CON_SUBRUTAS_SOLO_MIRAR.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

/**
 * Qué muestra el inicio "solo mirar" según cómo salió la última lectura. Si falla,
 * deja lo último que se vio y lo avisa, para no mostrar datos viejos como si fueran
 * de ahora. Sin nada para mostrar (falló la primera carga) lanza: un "no hay tomas"
 * sería falso.
 */
export function contenidoDeRespaldo<T>(fallo: boolean, ultimo: T | null | undefined, actual: T): { contenido: T; aviso: boolean } {
  if (!fallo) return { contenido: actual, aviso: false };
  if (!ultimo) throw new Error("No se pudieron leer los datos del inicio solo mirar.");
  return { contenido: ultimo, aviso: true };
}
