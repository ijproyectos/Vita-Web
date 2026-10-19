"use client";

import { useEffect, useState } from "react";

/**
 * ¿Este navegador tiene una suscripción push activa (permiso concedido + 
 * suscripción en el service worker)? Sirve para no prometer "te aviso de
 * nuevo" si el aviso no tiene cómo llegar. Arranca en `false` (igual que el
 * servidor) y se resuelve async: el setState ocurre después de un await, no
 * en el cuerpo sincrónico del efecto.
 */
export function usePushActivo(): boolean {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        const registro = await navigator.serviceWorker.getRegistration("/");
        const suscripcion = await registro?.pushManager.getSubscription();
        if (!cancelado && suscripcion) setActivo(true);
      } catch {
        // sin push: se queda en false.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return activo;
}
