import "server-only";

import { headers } from "next/headers";

/**
 * Origen absoluto para links dentro de emails. Mismo criterio que
 * app/app/perfil/compartir/actions.ts: NEXT_PUBLIC_SITE_URL si existe, si no
 * los headers de la request (host + proto reenviados por Netlify).
 */
export async function origenPublico(): Promise<string> {
  const fija = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fija) return fija.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export function emailValido(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}
