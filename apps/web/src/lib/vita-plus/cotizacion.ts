import { validarCotizacion } from "./planes";

// Dólar oficial (BNA, venta) desde una API pública JSON. Solo servidor. Caché en memoria de pocos minutos
// (por instancia serverless: es best-effort, no garantía). Si no se puede obtener un número sensato NO se
// inventa uno: se devuelve el fallo y quien llama decide no crear la suscripción.

export const URL_DOLAR_OFICIAL = "https://dolarapi.com/v1/dolares/oficial";
export const TTL_COTIZACION_MS = 5 * 60 * 1000;
export const TIMEOUT_COTIZACION_MS = 4_000;

export const MENSAJE_SIN_COTIZACION = "No pudimos obtener la cotización del dólar, probá en unos minutos";

export type ResultadoCotizacion = { ok: true; fx: number; fecha: string } | { ok: false };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let cache: { fx: number; fecha: string; hasta: number } | null = null;

export function reiniciarCacheCotizacion(): void {
  cache = null;
}

/** Lee `venta` de la respuesta de la API. Cualquier forma inesperada o valor insensato da null. */
export function extraerVenta(json: unknown): number | null {
  if (typeof json !== "object" || json === null) return null;
  return validarCotizacion((json as { venta?: unknown }).venta);
}

export async function obtenerDolarOficial(
  opciones: { fetchImpl?: FetchLike; ahoraMs?: number } = {}
): Promise<ResultadoCotizacion> {
  const ahora = opciones.ahoraMs ?? Date.now();
  if (cache && cache.hasta > ahora) return { ok: true, fx: cache.fx, fecha: cache.fecha };

  const hacerFetch: FetchLike = opciones.fetchImpl ?? ((url, init) => fetch(url, init));
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_COTIZACION_MS);
  try {
    const respuesta = await hacerFetch(URL_DOLAR_OFICIAL, {
      headers: { Accept: "application/json" },
      signal: controlador.signal,
      cache: "no-store",
    });
    if (!respuesta.ok) return { ok: false };
    const json: unknown = await respuesta.json();
    const fx = extraerVenta(json);
    if (fx === null) return { ok: false };
    const fecha = new Date(ahora).toISOString();
    cache = { fx, fecha, hasta: ahora + TTL_COTIZACION_MS };
    return { ok: true, fx, fecha };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
