export const INTERVALO_REFRESCO_MS = 90_000;

/**
 * Llama a `refrescar` cada cierto tiempo mientras la pantalla está abierta. No lo
 * intenta sin conexión ni con la app en segundo plano, y lo hace apenas la app
 * vuelve al frente o recupera la conexión. Devuelve la función que lo detiene.
 */
export function programarRefresco(refrescar: () => void): () => void {
  function intentar() {
    if (document.visibilityState === "visible" && navigator.onLine) refrescar();
  }
  const id = setInterval(intentar, INTERVALO_REFRESCO_MS);
  document.addEventListener("visibilitychange", intentar);
  window.addEventListener("online", intentar);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", intentar);
    window.removeEventListener("online", intentar);
  };
}
