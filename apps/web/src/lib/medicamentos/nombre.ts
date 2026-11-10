// Nombre de un medicamento tal como lo guarda la persona. Si viene con la
// forma "Forxiga (Dapagliflozina)", lo de afuera es el nombre comercial y lo
// de adentro del paréntesis es la droga. Lógica pura (cliente y servidor).

export type NombreYDroga = {
  /** Lo que va antes del paréntesis ("Forxiga"), o el nombre entero si no hay. */
  nombre: string;
  /** Lo de adentro del paréntesis final ("Dapagliflozina"), o null. */
  droga: string | null;
};

const CON_DROGA = /^(.+?)\s*\(([^()]+)\)\s*$/;

export function separarNombreDroga(texto: string): NombreYDroga {
  const limpio = texto.trim();
  const m = CON_DROGA.exec(limpio);
  if (!m) return { nombre: limpio, droga: null };
  const nombre = m[1].trim();
  const droga = m[2].trim();
  if (!nombre || !droga) return { nombre: limpio, droga: null };
  return { nombre, droga };
}

export const MAX_DROGA = 80;

/**
 * Nombre y droga listos para guardar. El nombre queda SIN el paréntesis (es
 * lo que se muestra y se lee siempre); la droga va a su propia columna. Una
 * droga explícita manda sobre la del paréntesis. `droga` undefined en la
 * entrada y sin paréntesis = undefined (en una edición: no tocarla).
 */
export function normalizarNombreYDroga(
  nombre: string,
  droga?: string | null
): { nombre: string; droga: string | null | undefined } {
  const separado = separarNombreDroga(nombre);
  const explicita = typeof droga === "string" ? droga.trim() : "";
  const final = explicita || separado.droga;
  if (final) return { nombre: separado.nombre, droga: final.slice(0, MAX_DROGA) };
  return { nombre: separado.nombre, droga: droga === undefined ? undefined : null };
}

const norma = (t: string | null | undefined) =>
  (t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Un remedio ya cargado que parece el mismo con OTRO nombre: comparten la
 * droga ("Forxiga" con droga Dapagliflozina y un alta de "Dapagliflozina", o
 * dos marcas de la misma droga). El mismo nombre no cuenta: eso lo cubre el
 * chequeo de horarios repetidos.
 */
export function mismoRemedioConOtroNombre<T extends { nombre: string; droga?: string | null }>(
  existentes: T[],
  nuevo: { nombre: string; droga?: string | null }
): T | null {
  const nombreNuevo = norma(nuevo.nombre);
  const clavesNuevo = new Set([nombreNuevo, norma(nuevo.droga)].filter(Boolean));
  for (const e of existentes) {
    if (norma(e.nombre) === nombreNuevo) continue;
    const drogaExistente = norma(e.droga);
    const nombreExistente = norma(e.nombre);
    const comparten =
      (drogaExistente && clavesNuevo.has(drogaExistente)) || (nuevo.droga && norma(nuevo.droga) === nombreExistente);
    if (comparten) return e;
  }
  return null;
}
