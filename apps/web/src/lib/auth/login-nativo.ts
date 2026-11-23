"use client";

import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import {
  clasificarError,
  configGoogle,
  digestNonce,
  generarNonce,
  mensajeNoDisponible,
  nombreCompleto,
  tokenTraeNonce,
  type FalloNativo,
  type Plataforma,
  type Proveedor,
} from "./login-nativo-logica";

// Native Google/Apple sign-in for the Capacitor shell (WebView loading this
// site). Google blocks the web OAuth redirect inside a WebView and Apple
// requires Sign in with Apple on iOS. The plugin is imported dynamically and
// only when running native, so the plain web bundle/behavior is unchanged.
// The ID token is exchanged with Supabase (`signInWithIdToken`): the session
// lands in cookies via @supabase/ssr and `/auth/continuar` finishes the
// post-login work. Never throws and never logs tokens.

export type ResultadoNativo = { ok: true } | FalloNativo;

/** "android" | "ios" inside the native shell, null on plain web. Safe anywhere. */
export function plataformaNativa(): Plataforma | null {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : null;
  } catch {
    return null;
  }
}

const APPLE_CLIENT_ID = "ar.com.soyvita.app";

async function cargarPlugin() {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  return SocialLogin;
}

export async function iniciarSesionNativo(proveedor: Proveedor): Promise<ResultadoNativo> {
  const plataforma = plataformaNativa();
  if (!plataforma || (proveedor === "apple" && plataforma !== "ios"))
    return { ok: false, motivo: "no-disponible", mensaje: mensajeNoDisponible(proveedor) };
  try {
    return proveedor === "google" ? await conGoogle(plataforma) : await conApple();
  } catch (e) {
    return clasificarError(e, proveedor);
  }
}

async function conGoogle(plataforma: Plataforma): Promise<ResultadoNativo> {
  const config = configGoogle(plataforma, {
    web: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ios: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  if (!config) return { ok: false, motivo: "no-disponible", mensaje: mensajeNoDisponible("google") };

  const rawNonce = generarNonce(crypto);
  const nonceDigest = await digestNonce(rawNonce, crypto.subtle);

  const plugin = await cargarPlugin();
  await plugin.initialize({ google: { ...config, mode: "online" } });
  const r = await plugin.login({ provider: "google", options: { scopes: ["email", "profile"], nonce: nonceDigest } });
  const resultado = r.result;
  const idToken = "idToken" in resultado ? resultado.idToken : null;
  if (!idToken) return { ok: false, motivo: "error", mensaje: "No se pudo iniciar sesión con Google. Intentá de nuevo." };

  // Supabase only wants the raw nonce when the token actually carries the claim.
  const { error } = await createClient().auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    ...(tokenTraeNonce(idToken) ? { nonce: rawNonce } : {}),
  });
  return error ? clasificarError(error, "google") : { ok: true };
}

async function conApple(): Promise<ResultadoNativo> {
  const plugin = await cargarPlugin();
  await plugin.initialize({ apple: { clientId: APPLE_CLIENT_ID } });
  const r = await plugin.login({ provider: "apple", options: { scopes: ["email", "name"] } });
  const idToken = r.result.idToken;
  if (!idToken) return { ok: false, motivo: "error", mensaje: "No se pudo iniciar sesión con Apple. Intentá de nuevo." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken });
  if (error) return clasificarError(error, "apple");

  // Apple sends the name only on the very first authorization: keep it in
  // user_metadata.full_name (where Google's name lands) so /auth/continuar
  // copies it to the profile and onboarding doesn't ask again. Best effort.
  const nombre = nombreCompleto(r.result.profile);
  if (nombre) {
    try {
      await supabase.auth.updateUser({ data: { full_name: nombre } });
    } catch {
      // Not critical: the user can still set the name in onboarding.
    }
  }
  return { ok: true };
}
