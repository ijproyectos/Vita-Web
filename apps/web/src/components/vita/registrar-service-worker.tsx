"use client";

import { useEffect } from "react";

// Registra /sw.js (solo maneja push + click; no cachea nada). Se monta una
// vez en el layout raíz. Silencioso: si el navegador no soporta service
// workers o el registro falla, la app sigue funcionando igual.
export function RegistrarServiceWorker() {
  useEffect(() => {
    const habilitado =
      process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    if (!habilitado || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return null;
}
