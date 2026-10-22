"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  fijarBloqueada,
  leerBloqueada,
  corresponderBloquear,
  marcarVisto,
  quitarPin,
  suscribirBloqueo,
} from "@/lib/seguridad/pin";
import { PinPantalla, PinPausado } from "./pin-pantalla";

// Bloqueo por PIN de /app/* (V7 Seguridad › "PIN al volver"). Solo actúa si
// ESTE dispositivo tiene un PIN para este usuario (localStorage). Bloquea al
// volver a abrir la app pasada la espera elegida (0/5/10/30 min); en el
// servidor y antes de hidratar nunca bloquea (no hay forma de saberlo), así
// que el primer pintado es el contenido y el overlay entra apenas hidrata.
export function BloqueoPin({ uid, nombre }: { uid: string; nombre: string }) {
  const bloqueada = useSyncExternalStore(
    suscribirBloqueo,
    () => leerBloqueada(uid),
    () => false
  );
  const [pausa, setPausa] = useState<"agotado" | "olvido" | null>(null);

  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.visibilityState === "hidden") {
        if (!leerBloqueada(uid)) marcarVisto(uid);
      } else if (corresponderBloquear(uid)) {
        fijarBloqueada(true);
      }
    }
    function alSalir() {
      if (!leerBloqueada(uid)) marcarVisto(uid);
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("pagehide", alSalir);
    return () => {
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("pagehide", alSalir);
    };
  }, [uid]);

  if (!bloqueada) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="vita bloqueada" className="fixed inset-0 z-[200] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-md">
        {pausa ? (
          <PinPausado motivo={pausa} onBorrarPin={() => quitarPin(uid)} />
        ) : (
          <PinPantalla
            uid={uid}
            nombre={nombre}
            modo="desbloquear"
            onListo={() => {
              marcarVisto(uid);
              fijarBloqueada(false);
            }}
            onOlvide={() => setPausa("olvido")}
            onAgotado={() => setPausa("agotado")}
          />
        )}
      </div>
    </div>
  );
}
