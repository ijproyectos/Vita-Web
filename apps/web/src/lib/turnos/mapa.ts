// Mapa del lugar de un turno, para confirmar que es ahí sin salir de la app.
// Lógica pura: qué se busca y la URL del mapa embebido.

export const MINIMO_CARACTERES_MAPA = 4;

/**
 * Lo que se busca en el mapa: "Sanatorio Norte, Av. Cabildo 2450" si hay las
 * dos cosas; si no, la que haya. null si es muy corto para buscar.
 */
export function consultaMapa(lugar: string | null | undefined, direccion?: string | null): string | null {
  const partes = [lugar, direccion].map((p) => p?.trim() ?? "").filter(Boolean);
  const consulta = [...new Set(partes)].join(", ");
  return consulta.length >= MINIMO_CARACTERES_MAPA ? consulta : null;
}

/**
 * URL para un <iframe> de Google Maps centrado en la búsqueda. Con clave
 * (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`) usa la Maps Embed API oficial; sin
 * clave, el embed público por consulta.
 */
export function urlMapaEmbebido(consulta: string, clave?: string | null): string {
  const q = encodeURIComponent(consulta);
  if (clave) return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(clave)}&q=${q}&language=es&region=AR`;
  return `https://maps.google.com/maps?q=${q}&z=16&hl=es&output=embed`;
}
