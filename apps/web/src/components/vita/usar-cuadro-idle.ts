"use client";

import { useEffect, useRef, useState } from "react";
import { CUADROS_IDLE } from "./estados-avatar";

// Reproduce el loop de 30 frames capturado del personaje respirando/
// parpadeando (idle/calm) — pedido explícito: "tenga movimiento como lo
// pasamos en las animaciones que te pasé", no la aproximación CSS que había
// antes. `intervaloMs` decide el ritmo (idle real, calm más pausado — ver
// INTERVALO_IDLE_MS/_CALM en estados-avatar.ts); `activo` en false congela
// en el frame 0 sin correr el timer (evita trabajo de fondo en estados que
// no lo usan, y es el mismo frame que ya se ve por defecto en SSR).
export function useCuadroIdle(activo: boolean, intervaloMs: number): number {
  const [cuadro, setCuadro] = useState(0);
  const cuadroRef = useRef(0);

  useEffect(() => {
    if (!activo) return;

    const id = setInterval(() => {
      cuadroRef.current = (cuadroRef.current + 1) % CUADROS_IDLE;
      setCuadro(cuadroRef.current);
    }, intervaloMs);

    return () => clearInterval(id);
  }, [activo, intervaloMs]);

  return activo ? cuadro : 0;
}
