"use client";

import { Capacitor } from "@capacitor/core";
import { borrarTokenNativoAction, guardarTokenNativoAction } from "./actions";
import { esRutaRelativaSegura } from "./push-fcm-logica";

// Native push branch (Capacitor Android shell that loads this web app in a
// WebView). Everything here is a no-op on the plain web: the plugin is
// imported dynamically and only after `esNativo()` is true, so the normal web
// bundle and behavior are unchanged. Never rejects.

const CLAVE_TOKEN = "vita:fcm-token";
const ID_CANAL = "avisos";
const ESPERA_TOKEN_MS = 15_000;

export type PermisoNativo = "granted" | "denied" | "prompt";

export function esNativo(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function plugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

/** Token remembered on this device so logout can delete exactly this row. */
export function leerTokenNativo(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

/** Forget the stored token (logout already deleted the server row). */
export function olvidarTokenNativo() {
  recordarToken(null);
}

function recordarToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // Storage blocked: logout falls back to the token the server already has.
  }
}

export async function permisoNativo(): Promise<PermisoNativo> {
  try {
    const p = await plugin();
    const { receive } = await p.checkPermissions();
    return receive === "granted" || receive === "denied" ? receive : "prompt";
  } catch {
    return "prompt";
  }
}

async function crearCanal() {
  const p = await plugin();
  // Android 8+: the channel decides sound/heads-up. Must match CANAL_ANDROID on the server.
  await p.createChannel({
    id: ID_CANAL,
    name: "Avisos",
    description: "Recordatorios de medicación y avisos de tu familia",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

/** Registers with FCM and resolves with this device's token (null on error or timeout). */
async function obtenerToken(): Promise<string | null> {
  const p = await plugin();
  return new Promise<string | null>((resolver) => {
    const handles: { remove: () => Promise<void> }[] = [];
    let terminado = false;
    const terminar = (valor: string | null) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(corte);
      for (const h of handles) void h.remove().catch(() => {});
      resolver(valor);
    };
    const corte = setTimeout(() => terminar(null), ESPERA_TOKEN_MS);
    void (async () => {
      try {
        handles.push(await p.addListener("registration", (t) => terminar(t.value)));
        handles.push(await p.addListener("registrationError", () => terminar(null)));
        await p.register();
      } catch {
        terminar(null);
      }
    })();
  });
}

/**
 * Registers the device (permission must already be granted) and sends the
 * token to the server. Returns true when the server stored it.
 */
export async function sincronizarTokenNativo(): Promise<boolean> {
  try {
    await crearCanal();
    const token = await obtenerToken();
    if (!token) return false;
    const r = await guardarTokenNativoAction({ token, plataforma: "android" });
    if (r.status !== "success") return false;
    recordarToken(token);
    return true;
  } catch {
    return false;
  }
}

/** Call INSIDE the user tap. Resolves with the final permission and whether the token was stored. */
export async function activarPushNativo(): Promise<{ permiso: PermisoNativo; registrado: boolean }> {
  try {
    const p = await plugin();
    const { receive } = await p.requestPermissions();
    if (receive !== "granted") return { permiso: receive === "denied" ? "denied" : "prompt", registrado: false };
    return { permiso: "granted", registrado: await sincronizarTokenNativo() };
  } catch {
    return { permiso: "prompt", registrado: false };
  }
}

/** Removes this device's token from the server and unregisters from FCM. */
export async function desactivarPushNativo(): Promise<void> {
  const token = leerTokenNativo();
  try {
    if (token) await borrarTokenNativoAction(token);
  } catch {
    // Server unreachable: the dead token is cleaned on the next failed send.
  }
  recordarToken(null);
  try {
    await (await plugin()).unregister();
  } catch {
    // Nothing to unregister.
  }
}

let escuchando = false;

/**
 * Notification tap: open the screen in `data.url`, only if it is a same-origin
 * relative path. Idempotent; call once at app start.
 */
export async function escucharTapsNativos(navegar: (ruta: string) => void): Promise<void> {
  if (escuchando || !esNativo()) return;
  escuchando = true;
  try {
    const p = await plugin();
    await p.addListener("pushNotificationActionPerformed", (accion) => {
      const url: unknown = accion.notification?.data?.url;
      if (esRutaRelativaSegura(url)) navegar(url);
    });
  } catch {
    escuchando = false;
  }
}
