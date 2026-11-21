import "server-only";

import { JWT } from "google-auth-library";
import { armarMensajeFcm, clasificarErrorFcm, type PayloadNativo } from "./push-fcm-logica";

// Native Android push through FCM HTTP v1. Same contract as the Web Push
// sender: never throws, returns counts, and never logs secrets or tokens
// (only counts and status codes).

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TIMEOUT_MS = 10_000;

export type TokenNativo = { id: string; token: string };

export type ResultadoFcm = {
  enviados: number;
  fallidos: number;
  /** Ids of the rows whose token FCM reported as dead. */
  muertos: string[];
  /** true when FIREBASE_SERVICE_ACCOUNT is missing or invalid: nothing was attempted. */
  sinConfigurar?: boolean;
};

type Credenciales = { projectId: string; cliente: JWT };

let cache: { crudo: string; credenciales: Credenciales | null } | null = null;

/** Parses the service-account env once per process (re-parsed only if the value changes). */
function obtenerCredenciales(): Credenciales | null {
  const crudo = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!crudo) return null;
  if (cache && cache.crudo === crudo) return cache.credenciales;

  let credenciales: Credenciales | null = null;
  try {
    const json = JSON.parse(crudo) as { project_id?: unknown; client_email?: unknown; private_key?: unknown };
    if (typeof json.project_id === "string" && typeof json.client_email === "string" && typeof json.private_key === "string") {
      credenciales = {
        projectId: json.project_id,
        cliente: new JWT({ email: json.client_email, key: json.private_key, scopes: [SCOPE] }),
      };
    }
  } catch {
    credenciales = null;
  }
  cache = { crudo, credenciales };
  return credenciales;
}

export function fcmConfigurado(): boolean {
  return obtenerCredenciales() !== null;
}

async function conTimeout(url: string, init: RequestInit): Promise<Response> {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controlador.signal });
  } finally {
    clearTimeout(corte);
  }
}

/** Sends `payload` to every native token. Never throws. */
export async function enviarFcm(tokens: TokenNativo[], payload: PayloadNativo): Promise<ResultadoFcm> {
  const resultado: ResultadoFcm = { enviados: 0, fallidos: 0, muertos: [] };
  if (tokens.length === 0) return resultado;

  const credenciales = obtenerCredenciales();
  if (!credenciales) return { ...resultado, sinConfigurar: true };

  let accessToken: string | null | undefined;
  try {
    // The client caches the access token and refreshes it before it expires.
    accessToken = (await credenciales.cliente.getAccessToken()).token;
  } catch {
    console.error("[push-fcm] could not obtain an access token");
  }
  if (!accessToken) return { ...resultado, fallidos: tokens.length };

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credenciales.projectId)}/messages:send`;
  const cabeceras = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  await Promise.all(
    tokens.map(async (t) => {
      try {
        const respuesta = await conTimeout(endpoint, {
          method: "POST",
          headers: cabeceras,
          body: JSON.stringify({ message: armarMensajeFcm(t.token, payload) }),
        });
        if (respuesta.ok) {
          resultado.enviados++;
          return;
        }
        const cuerpo: unknown = await respuesta.json().catch(() => undefined);
        if (clasificarErrorFcm({ status: respuesta.status, cuerpo }) === "token-muerto") {
          resultado.muertos.push(t.id);
        } else {
          resultado.fallidos++;
          console.error(`[push-fcm] send failed with status ${respuesta.status}`);
        }
      } catch {
        resultado.fallidos++;
      }
    })
  );

  return resultado;
}
