"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_REFRESCO_MS = 45_000;

/**
 * Vuelve a pedir al servidor los datos de la pantalla mientras está abierta (tomas
 * de hoy). No lo intenta sin conexión ni con la app en segundo plano, y actualiza
 * apenas la app vuelve al frente o recupera la conexión.
 */
export function useRefrescoPeriodico() {
  const router = useRouter();
  useEffect(() => {
    function refrescar() {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }
    const id = setInterval(refrescar, INTERVALO_REFRESCO_MS);
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("online", refrescar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refrescar);
      window.removeEventListener("online", refrescar);
    };
  }, [router]);
}

/** Lo mismo para pantallas de servidor, que no pueden usar el hook. */
export function RefrescoPeriodico() {
  useRefrescoPeriodico();
  return null;
}
