"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { VitaIcon } from "@/lib/vita-icons";
import { BUILD_ID } from "@/lib/version";
import { buildDeRespuesta, hayVersionNueva } from "@/lib/version-nueva";

const CADA_MS = 10 * 60 * 1000;
const CLAVE = "vita_version_descartada";

function leerDescartado(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

// Aviso de "Hay una versión nueva de vita": compara el build con el que se
// renderizó esta pestaña contra /api/version (el del servidor en ejecución).
// Chequea al cargar, cada 10 min, al volver a la pestaña y al recuperar la red;
// no consulta sin red ni con la pestaña oculta. "Más tarde" se recuerda por
// sesión (sessionStorage) y solo para ese build: un deploy posterior avisa de nuevo.
// No hay manera confiable de saber si suena un audio, así que no se interrumpe
// nada: es una tarjeta fija que no tapa la pantalla ni roba el foco.
export function AvisoVersionNueva() {
  const [buildNuevo, setBuildNuevo] = useState<string | null>(null);
  const descartadoRef = useRef<string | null>(null);
  const pathname = usePathname();
  const simple = pathname.startsWith("/app/modo-simple");

  const revisar = useCallback(async () => {
    const enLinea = navigator.onLine;
    const visible = document.visibilityState === "visible";
    if (!enLinea || !visible) return;
    try {
      const r = await fetch("/api/version", { cache: "no-store" });
      if (!r.ok) return;
      const buildServidor = buildDeRespuesta(await r.json());
      const descartado = descartadoRef.current ?? leerDescartado();
      if (hayVersionNueva({ buildActual: BUILD_ID, buildServidor, descartado, enLinea, visible })) {
        setBuildNuevo(buildServidor);
      }
    } catch {
      // Sin red o servidor caído: se reintenta en el próximo chequeo.
    }
  }, []);

  useEffect(() => {
    descartadoRef.current = leerDescartado();
    const inicial = setTimeout(revisar, 3000);
    const intervalo = setInterval(revisar, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", revisar);
    return () => {
      clearTimeout(inicial);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", revisar);
    };
  }, [revisar]);

  function masTarde() {
    descartadoRef.current = buildNuevo;
    try {
      if (buildNuevo) sessionStorage.setItem(CLAVE, buildNuevo);
    } catch {
      // Sin storage: solo se descarta mientras la pestaña siga abierta.
    }
    setBuildNuevo(null);
  }

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[var(--safe-bottom-nav)] z-[60] flex justify-center px-4 pb-3">
      {buildNuevo &&
        (simple ? (
          <div className="pointer-events-auto w-full max-w-md rounded-[24px] bg-foreground p-4 text-primary-foreground shadow-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
            <p className="text-pretty text-[20px] font-bold leading-[1.3]">Hay una versión nueva. Tocá para actualizar.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 w-full rounded-full bg-primary py-4 text-[19px] font-extrabold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
            >
              Actualizar
            </button>
            <button type="button" onClick={masTarde} className="mt-1 w-full rounded-full py-3 text-[16px] font-bold text-primary-foreground/80">
              Más tarde
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[20px] bg-foreground py-3 pl-4 pr-3 text-primary-foreground shadow-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
            <VitaIcon name="refresh" size={20} className="shrink-0" />
            <p className="min-w-0 flex-1 text-pretty text-[13.5px] font-bold leading-snug">Hay una versión nueva de vita</p>
            <button type="button" onClick={masTarde} className="shrink-0 rounded-full px-3 py-2 text-[12.5px] font-bold text-primary-foreground/75 focus-visible:outline-2 focus-visible:outline-primary-foreground">
              Más tarde
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 rounded-full bg-primary px-4 py-2 text-[12.5px] font-extrabold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
            >
              Actualizar
            </button>
          </div>
        ))}
    </div>
  );
}
