import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { colorPorDefecto } from "./colores";
import { estadoHoyPorPerfil, listarFamilia } from "./nucleo";
import { esColorPerfil, type MiembroFamilia, type OpcionPerfil, type PerfilActivo, type RolVinculo } from "./tipos";

// Perfil activo de /app/*: de quién son los remedios/turnos/salud que se ven
// y se cargan. Vive en la cookie `vita_perfil` (httpOnly, path /app) y NUNCA
// se confía en ella: en cada request se valida contra `listar_familia()`
// (vínculo aceptado hacia el usuario logueado, RLS/security definer). Si no
// es válida (revocado, id inventado) se cae al propio perfil. Aun así la
// autoridad final es la RLS de cada tabla (es_cuidador_de/puede_editar_de):
// esto solo decide QUÉ id se le pasa al núcleo de dominio.

export const COOKIE_PERFIL_ACTIVO = "vita_perfil";

type Contexto = {
  usuarioId: string;
  propio: PerfilActivo;
  familia: MiembroFamilia[];
  activo: PerfilActivo;
};

const resolverContexto = cache(async (): Promise<Contexto> => {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [{ data: perfilPropio }, familia, almacen] = await Promise.all([
    supabase.from("perfiles").select("nombre, color").eq("id", usuario.id).maybeSingle(),
    listarFamilia(supabase),
    cookies(),
  ]);

  // Without a name in `perfiles`, fall back to the one Google gave us.
  const meta = usuario.user_metadata ?? {};
  const nombrePropio =
    (perfilPropio?.nombre as string | null)?.trim() ||
    (typeof meta.full_name === "string" ? meta.full_name.trim() : "") ||
    (typeof meta.name === "string" ? meta.name.trim() : "");

  const propio: PerfilActivo = {
    id: usuario.id,
    nombre: nombrePropio ? nombreConMayuscula(nombrePropio) : "Mi perfil",
    color: esColorPerfil(perfilPropio?.color) ? perfilPropio.color : "teal",
    esPropio: true,
    rol: "editar",
  };

  const elegido = almacen.get(COOKIE_PERFIL_ACTIVO)?.value;
  const indice = elegido ? familia.findIndex((m) => m.id === elegido) : -1;
  const miembro = indice >= 0 ? familia[indice] : null;

  const activo: PerfilActivo = miembro
    ? {
        id: miembro.id,
        nombre: miembro.nombre,
        color: miembro.color ?? colorPorDefecto(indice),
        esPropio: false,
        rol: miembro.rol,
      }
    : propio;

  return { usuarioId: usuario.id, propio, familia, activo };
});

/** Perfil activo validado de esta request (fallback: el propio). Redirige a /login sin sesión. */
export async function obtenerPerfilActivo(): Promise<PerfilActivo> {
  return (await resolverContexto()).activo;
}

/** Opciones del selector: el propio perfil primero y después las personas que cuido. */
const calcularOpciones = cache(async (): Promise<OpcionPerfil[]> => {
  const { propio, familia } = await resolverContexto();
  // Línea de estado por persona (V7 "¿De quién querés ver?"): 2 consultas en
  // total, y solo si hay a quién cambiar (con un único perfil el selector
  // no se muestra).
  const estados =
    familia.length > 0
      ? await estadoHoyPorPerfil(await createClient(), [propio.id, ...familia.map((m) => m.id)])
      : new Map();
  return [
    { id: propio.id, nombre: propio.nombre, color: propio.color, sub: "Tu perfil", esPropio: true, estado: estados.get(propio.id) },
    ...familia.map((m, i) => ({
      id: m.id,
      nombre: m.nombre,
      color: m.color ?? colorPorDefecto(i),
      sub: [m.relacion, m.rol === "ver" ? "Solo ver" : null].filter(Boolean).join(" · ") || "A tu cargo",
      esPropio: false,
      estado: estados.get(m.id),
    })),
  ];
});

export async function obtenerOpcionesPerfil(): Promise<OpcionPerfil[]> {
  return calcularOpciones();
}

/** True si `id` es el propio usuario o alguien con vínculo aceptado hacia él. */
export async function esPerfilValido(id: string): Promise<boolean> {
  const { propio, familia } = await resolverContexto();
  return id === propio.id || familia.some((m) => m.id === id);
}

/**
 * Permiso del usuario logueado sobre los datos de `id`, sin importar cuál sea
 * el perfil activo: "editar" si es el propio, el rol del vínculo si lo cuida,
 * null si no tiene acceso. Para acciones sobre una fila existente (marcar una
 * toma, borrar un medicamento) cuyo dueño se resuelve desde la propia fila.
 */
export async function rolSobre(id: string): Promise<RolVinculo | null> {
  const { propio, familia } = await resolverContexto();
  if (id === propio.id) return "editar";
  return familia.find((m) => m.id === id)?.rol ?? null;
}

export const MENSAJE_SOLO_LECTURA = "Tenés permiso de solo ver este perfil. Pedile a la persona que te dé permiso de Admin.";

/**
 * Para Server Actions que escriben datos del perfil activo: devuelve el id
 * sobre el que escribir, o un error amable si el permiso es 'ver'. La RLS
 * igual rechazaría la escritura; esto solo da un mensaje claro antes.
 * Llamarlo FUERA del try (puede redirigir a /login).
 */
export async function perfilActivoEditable(): Promise<
  { ok: true; perfil: PerfilActivo } | { ok: false; message: string }
> {
  const perfil = await obtenerPerfilActivo();
  if (perfil.rol !== "editar") return { ok: false, message: MENSAJE_SOLO_LECTURA };
  return { ok: true, perfil };
}
