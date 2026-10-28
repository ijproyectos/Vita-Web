"use client";

import { useRef, type ReactNode } from "react";

const ESPERA_MAX_MS = 2500;

/**
 * Logout form that also drops THIS device's push subscription, so a shared
 * phone does not keep receiving the previous user's dose reminders. It posts
 * to /auth/signout like the plain form, adding the subscription endpoint so the
 * server can delete its row (session client, RLS). Anything that fails or takes
 * too long is skipped: logging out is never blocked.
 */
export function FormCerrarSesion({ children, className }: { children: ReactNode; className?: string }) {
  const endpointRef = useRef<HTMLInputElement>(null);
  const enCursoRef = useRef(false);

  async function quitarSuscripcionLocal(): Promise<string | null> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const registro = await navigator.serviceWorker.getRegistration();
    const suscripcion = await registro?.pushManager.getSubscription();
    if (!suscripcion) return null;
    const endpoint = suscripcion.endpoint;
    await suscripcion.unsubscribe().catch(() => false);
    return endpoint;
  }

  return (
    <form
      action="/auth/signout"
      method="post"
      className={className}
      onSubmit={(e) => {
        if (enCursoRef.current) return; // second pass: let the native submit go through
        e.preventDefault();
        enCursoRef.current = true;
        const form = e.currentTarget;
        const limite = new Promise<null>((resolver) => setTimeout(() => resolver(null), ESPERA_MAX_MS));
        Promise.race([quitarSuscripcionLocal(), limite])
          .catch(() => null)
          .then((endpoint) => {
            if (endpointRef.current && endpoint) endpointRef.current.value = endpoint;
            form.submit();
          });
      }}
    >
      <input ref={endpointRef} type="hidden" name="endpoint" defaultValue="" />
      {children}
    </form>
  );
}
