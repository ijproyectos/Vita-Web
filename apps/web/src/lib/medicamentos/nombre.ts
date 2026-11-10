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

/** "Forxiga (Dapagliflozina)"; sin droga, el nombre solo. */
export function nombreConDroga(nombre: string, droga: string | null | undefined): string {
  const n = nombre.trim();
  const d = droga?.trim();
  return d && d.toLowerCase() !== n.toLowerCase() ? `${n} (${d})` : n;
}
