// Teclado grande de medición del modo simple: armar el número tecla por tecla. PURO.

export type ReglasNumero = { decimales: boolean; maxEnteros: number };

/** Agrega una tecla ("0"-"9" o ",") respetando la cantidad de enteros y un solo decimal. */
export function agregarTecla(actual: string, tecla: string, reglas: ReglasNumero): string {
  if (tecla === ",") {
    if (!reglas.decimales || actual.includes(",") || actual === "") return actual;
    return `${actual},`;
  }
  if (!/^\d$/.test(tecla)) return actual;
  const [enteros, decimal] = actual.split(",");
  if (decimal !== undefined) return decimal.length >= 1 ? actual : `${actual}${tecla}`;
  if (enteros.length >= reglas.maxEnteros) return actual;
  if (enteros === "0") return tecla;
  return `${actual}${tecla}`;
}

/** "36,8" -> 36.8; vacío o a medio escribir ("36,") -> null. */
export function aNumero(texto: string): number | null {
  if (!texto || texto.endsWith(",")) return null;
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
