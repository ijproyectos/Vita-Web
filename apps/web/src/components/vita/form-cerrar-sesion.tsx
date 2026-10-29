"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

const ESPERA_MAX_MS = 2500;
const ESPERA_FETCH_MS = 3000;

/**
 * Logout form that also drops THIS device's push subscription, so a shared
 * phone does not keep receiving the previous user's dose reminders. Order
 * matters: the endpoint goes to /auth/signout first (the server deletes its
 * row, then ends the session); only after the server confirmed is the browser
 * subscription removed, so a failed logout never leaves the user signed in
 * without push. The fetch is aborted after ~3 s; on timeout or error it falls
 * back to the plain native form post, which still carries the endpoint through
 * a hidden input so the server deletes the row. Logging out is never blocked.
 *
 * `antesDeSalir` runs once the logout is done and right before navigating
 * (e.g. to clear a per-device PIN), never while the form still has to submit.
 */
export function FormCerrarSesion({
  children,
  className,
  antesDeSalir,
}: {
  children: ReactNode;
  className?: string;
  antesDeSalir?: () => void;
}) {
  const router = useRouter();
  const enCursoRef = useRef(false);

  async function suscripcionLocal(): Promise<PushSubscription | null> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const registro = await navigator.serviceWorker.getRegistration();
    return (await registro?.pushManager.getSubscription()) ?? null;
  }

  async function cerrar(form: HTMLFormElement) {
    const suscripcion = await Promise.race([
      suscripcionLocal().catch(() => null),
      new Promise<null>((resolver) => setTimeout(() => resolver(null), ESPERA_MAX_MS)),
    ]);
    const controlador = new AbortController();
    const corte = setTimeout(() => controlador.abort(), ESPERA_FETCH_MS);
    try {
      const datos = new FormData();
      if (suscripcion) datos.set("endpoint", suscripcion.endpoint);
      const respuesta = await fetch(form.action, { method: "POST", body: datos, credentials: "same-origin", signal: controlador.signal });
      clearTimeout(corte);
      if (!respuesta.ok) throw new Error("signout");
      // The server confirmed: now it is safe to drop the local subscription.
      await suscripcion?.unsubscribe().catch(() => false);
      antesDeSalir?.();
      router.replace("/login");
      router.refresh();
    } catch {
      clearTimeout(corte);
      // Network or server hiccup: fall back to the native post. The form is
      // still mounted here (antesDeSalir has not run), so the submit is not detached.
      if (suscripcion) {
        // Fill the hidden input right before the native post so the server can delete the row.
        const campo = form.elements.namedItem("endpoint");
        if (campo instanceof HTMLInputElement) campo.value = suscripcion.endpoint;
      }
      form.submit();
      antesDeSalir?.();
    }
  }

  return (
    <form
      action="/auth/signout"
      method="post"
      className={className}
      onSubmit={(e) => {
        if (enCursoRef.current) return;
        e.preventDefault();
        enCursoRef.current = true;
        void cerrar(e.currentTarget);
      }}
    >
      <input type="hidden" name="endpoint" defaultValue="" />
      {children}
    </form>
  );
}
