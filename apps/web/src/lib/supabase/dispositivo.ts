import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createAdminClient } from "./admin";
import { createClient } from "./server";
import { motivoRechazoDispositivo, tokenVigente, usuarioDeDispositivo } from "./dispositivo-logica";

/**
 * TEST-ONLY shortcut: lets a headless device call the chat/voice APIs as ONE existing
 * user with a fixed bearer token (DISPOSITIVO_TOKEN + DISPOSITIVO_USUARIO_ID). To be
 * replaced by per-device tokens. Any other request (browsers) gets the normal cookie client.
 * Never throws and never logs tokens: on any failure it falls back to the cookie client.
 */

type Acceso = { access: string; expiraSeg: number };

let cache: Acceso | null = null;
let enVuelo: Promise<Acceso | null> | null = null;

async function acuniar(usuarioId: string): Promise<Acceso | null> {
  try {
    const admin = createAdminClient();
    const { data: u, error: e1 } = await admin.auth.admin.getUserById(usuarioId);
    const email = u?.user?.email;
    if (e1 || !email) return fallo(e1 ? `getUserById:${e1.status ?? e1.code ?? "error"}` : "usuario_sin_email");
    const { data: l, error: e2 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hash = l?.properties?.hashed_token;
    if (e2 || !hash) return fallo(e2 ? `generateLink:${e2.status ?? e2.code ?? "error"}` : "generateLink_sin_hash");
    const anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hash });
    const s = data?.session;
    if (error || !s?.access_token || !s.expires_at) {
      return fallo(error ? `verifyOtp:${error.status ?? error.code ?? "error"}` : "verifyOtp_sin_sesion");
    }
    return { access: s.access_token, expiraSeg: s.expires_at };
  } catch (e) {
    return fallo(`excepcion:${e instanceof Error ? e.name : "desconocida"}`);
  }
}

/** Diagnostic log: reason code only, never tokens, emails or ids. */
function fallo(motivo: string): null {
  console.warn(`[dispositivo] no se pudo autenticar: ${motivo}`);
  return null;
}

async function accesoVigente(usuarioId: string): Promise<string | null> {
  if (cache && tokenVigente(cache.expiraSeg, Math.floor(Date.now() / 1000))) return cache.access;
  enVuelo ??= acuniar(usuarioId).finally(() => {
    enVuelo = null;
  });
  const nuevo = await enVuelo;
  if (nuevo) cache = nuevo;
  return nuevo?.access ?? null;
}

export async function createClientConDispositivo() {
  try {
    const auth = (await headers()).get("authorization");
    const env = { DISPOSITIVO_TOKEN: process.env.DISPOSITIVO_TOKEN, DISPOSITIVO_USUARIO_ID: process.env.DISPOSITIVO_USUARIO_ID };
    const usuarioId = usuarioDeDispositivo(auth, env);
    const rechazo = motivoRechazoDispositivo(auth, env);
    if (rechazo) console.warn(`[dispositivo] bearer rechazado: ${rechazo}`);
    if (usuarioId) {
      const access = await accesoVigente(usuarioId);
      if (access) {
        return createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${access}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
      }
    }
  } catch {
    // fall through to the cookie client
  }
  return createClient();
}
