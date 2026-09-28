"use client";

import { useEffect, useRef, useState } from "react";
import { obtenerAnalizadorDeVoz } from "@/lib/voz/hablar-cliente";

// Lip-sync básico basado en la reproducción real del audio (pedido
// explícito: "evitando movimientos aleatorios excesivos") — mide la
// amplitud RMS del <audio> que está sonando (obtenerAnalizadorDeVoz(),
// lib/voz/hablar-cliente.ts) y elige uno de los 3 frames de boca
// (CUADRO_SPEAKING, estados-avatar.ts: cerrada/media/abierta) según el
// volumen instantáneo — nunca alterna al azar. Debounce de 90ms para que
// no titile frame a frame en cada muestra.
const UMBRAL_MEDIO = 0.045;
const UMBRAL_ABIERTO = 0.12;
const DEBOUNCE_MS = 90;

export function useCuadroHabla(activo: boolean): 0 | 1 | 2 {
  const [cuadro, setCuadro] = useState<0 | 1 | 2>(0);
  const ultimoCambioRef = useRef(0);

  useEffect(() => {
    if (!activo) return;

    let raf = 0;
    // Tipado explícito del buffer (no ArrayBufferLike) — el lib.dom.d.ts de
    // esta versión de TS distingue Uint8Array<ArrayBuffer> de
    // <ArrayBufferLike>, y getByteTimeDomainData solo acepta el primero.
    let datos: Uint8Array<ArrayBuffer> | null = null;

    function paso() {
      const analizador = obtenerAnalizadorDeVoz();
      if (analizador) {
        if (!datos || datos.length !== analizador.fftSize) datos = new Uint8Array(analizador.fftSize);
        analizador.getByteTimeDomainData(datos);
        let suma = 0;
        for (let i = 0; i < datos.length; i++) {
          const n = (datos[i] - 128) / 128;
          suma += n * n;
        }
        const rms = Math.sqrt(suma / datos.length);
        const nuevo: 0 | 1 | 2 = rms > UMBRAL_ABIERTO ? 2 : rms > UMBRAL_MEDIO ? 1 : 0;

        const ahora = new Date().getTime();
        if (ahora - ultimoCambioRef.current > DEBOUNCE_MS) {
          ultimoCambioRef.current = ahora;
          setCuadro((actual) => (actual === nuevo ? actual : nuevo));
        }
      }
      raf = requestAnimationFrame(paso);
    }

    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [activo]);

  // En vez de resetear el estado a 0 desde el cuerpo del efecto cuando deja
  // de estar activo (dispara react-hooks/set-state-in-effect), se devuelve
  // 0 derivado directamente acá — el estado interno queda con su último
  // valor, pero nunca se expone mientras !activo.
  return activo ? cuadro : 0;
}
