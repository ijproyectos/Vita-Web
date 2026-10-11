"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as compartirNucleo from "@/lib/compartir/nucleo";
import { DURACIONES, type DuracionEnlace } from "@/lib/compartir/tipos";

// Server Actions nunca lanzan: cualquier error de la capa de datos se
// traduce a un mensaje legible (ver EstadoAccion en rutina/actions.ts).
export type EstadoCrearEnlace =
  | { status: "idle" }
  | { status: "success"; url: string; expiraAt: string }
  | { status: "error"; message: string };

// El origen sale de NEXT_PUBLIC_SITE_URL si está definida; si no, de los
// headers de la request (host + proto reenviados por Netlify).
async function origenPublico(): Promise<string> {
  const fija = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fija) return fija.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function crearEnlaceAction(
  _prev: EstadoCrearEnlace,
  formData: FormData
): Promise<EstadoCrearEnlace> {
  const usuario = await requireUser();
  const supabase = await createClient();

  const duracion = String(formData.get("duracion") ?? "");
  if (!DURACIONES.some((d) => d.valor === duracion)) {
    return { status: "error", message: "Elegí cuánto tiempo va a durar el link." };
  }

  try {
    const { token, expira_at } = await compartirNucleo.crearEnlace(supabase, usuario.id, {
      etiqueta: String(formData.get("etiqueta") ?? ""),
      duracion: duracion as DuracionEnlace,
    });
    revalidatePath("/app/perfil/compartir");
    return { status: "success", url: `${await origenPublico()}/p/${token}`, expiraAt: expira_at };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }
}

export async function revocarEnlaceAction(enlaceId: string): Promise<{ status: "success" } | { status: "error"; message: string }> {
  const usuario = await requireUser();
  const supabase = await createClient();
  try {
    await compartirNucleo.revocarEnlace(supabase, usuario.id, enlaceId);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }
  revalidatePath("/app/perfil/compartir");
  return { status: "success" };
}
