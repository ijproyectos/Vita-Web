"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// "Volver" con fallback: router.back() sale de la app (o no hace nada) si la
// pantalla se abrió directo (link de un aviso push, pestaña nueva). Para saber
// si hay una entrada ANTERIOR dentro de la app se numera cada entrada del
// historial del navegador con un índice guardado en `history.state`
// (`__vi`): una entrada nueva (push) suma 1, un replace conserva el índice y
// atrás/adelante/recarga recuperan el índice de la entrada a la que se vuelve.
// Hay a dónde volver solo si el índice actual es > 0.
const CLAVE = "__vi";
let indiceActual = 0;
let ultimaLongitud = 0;
let iniciado = false;

export function RastreadorNavegacion() {
  const pathname = usePathname();
  const params = useSearchParams().toString();
  useEffect(() => {
    const estado = (window.history.state ?? {}) as Record<string, unknown>;
    let indice: number;
    if (typeof estado[CLAVE] === "number") {
      indice = estado[CLAVE] as number;
    } else {
      indice = !iniciado ? 0 : window.history.length > ultimaLongitud ? indiceActual + 1 : indiceActual;
      window.history.replaceState({ ...estado, [CLAVE]: indice }, "");
    }
    iniciado = true;
    indiceActual = indice;
    ultimaLongitud = window.history.length;
  }, [pathname, params]);
  return null;
}

/** Devuelve `volver()`: back si hay una entrada anterior dentro de la app, si no `fallback`. */
export function useVolver(fallback: string) {
  const router = useRouter();
  return () => {
    if (indiceActual > 0) router.back();
    else router.replace(fallback);
  };
}
