import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createAdminClient } from "./admin";
import { createClient } from "./server";
import { tokenVigente, usuarioDeDispositivo } from "./dispositivo-logica";

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
    if (e1 || !email) return null;
    const { data: l, error: e2 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hash = l?.properties?.hashed_token;
    if (e2 || !hash) return null;
    const anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hash });
    const s = data?.session;
    if (error || !s?.access_token || !s.expires_at) return null;
    return { access: s.access_token, expiraSeg: s.expires_at };
  } catch {
    return null;
  }
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
    const usuarioId = usuarioDeDispositivo(auth, { DISPOSITIVO_TOKEN: process.env.DISPOSITIVO_TOKEN, DISPOSITIVO_USUARIO_ID: process.env.DISPOSITIVO_USUARIO_ID });
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
