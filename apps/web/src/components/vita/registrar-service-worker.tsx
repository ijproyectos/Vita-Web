"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { escucharTapsNativos, esNativo } from "@/lib/notificaciones/push-nativo";

// Registra /sw.js (solo maneja push + click; no cachea nada). Se monta una
// vez en el layout raíz. Silencioso: si el navegador no soporta service
// workers o el registro falla, la app sigue funcionando igual. En la app
// nativa (Capacitor) no hay service worker: el push va por FCM y acá solo se
// engancha el toque de la notificación para abrir su pantalla.
export function RegistrarServiceWorker() {
  const router = useRouter();

  useEffect(() => {
    if (esNativo()) {
      void escucharTapsNativos((ruta) => router.push(ruta));
      return;
    }
    const habilitado =
      process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    if (!habilitado || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, [router]);

  return null;
}
