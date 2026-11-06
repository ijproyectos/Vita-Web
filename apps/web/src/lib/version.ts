// Fuente única de la versión de la app. Los valores se incrustan al compilar
// (ver next.config.ts): versión de package.json, SHA corto del commit y fecha.

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? "";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "6 nov 2026" (fecha en Argentina) o "" si no es una fecha válida. */
export function formatoFechaBuild(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const ar = new Date(d.getTime() - 3 * 3600_000); // AR = UTC-3, sin horario de verano
  return `${ar.getUTCDate()} ${MESES[ar.getUTCMonth()]} ${ar.getUTCFullYear()}`;
}

/** "build abc1234 · 6 nov 2026" (sin la fecha si no hay). */
export function textoBuild(build: string, fechaIso: string): string {
  const fecha = formatoFechaBuild(fechaIso);
  return fecha ? `build ${build} · ${fecha}` : `build ${build}`;
}

export const TEXTO_VERSION = `versión ${APP_VERSION}`;
export const TEXTO_BUILD = textoBuild(BUILD_ID, BUILD_DATE);
