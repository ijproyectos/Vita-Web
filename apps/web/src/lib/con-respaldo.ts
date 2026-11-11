/**
 * Espera una lectura accesoria y, si falla, devuelve `respaldo` en vez de
 * lanzar (esa parte de la pantalla no se muestra y el resto sigue). Con `que`
 * deja un console.error para poder rastrearlo.
 */
export async function conRespaldo<T>(promesa: Promise<T>, respaldo: T, que?: string): Promise<T> {
  try {
    return await promesa;
  } catch (e) {
    if (que) console.error(`[modo-simple] no se pudo leer ${que}`, e);
    return respaldo;
  }
}
