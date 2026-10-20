"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { COOKIE_PERFIL_ACTIVO, esPerfilValido } from "@/lib/familia/perfil-activo";
import {
  esColorPerfil,
  esRolVinculo,
  type ResultadoCrearPerfil,
  type ResultadoFamilia,
} from "@/lib/familia/tipos";
import { CONDICIONES } from "@/lib/onboarding/catalogo-condiciones";

// Server Actions de Familia. Nunca lanzan; requireUser queda fuera del try
// (redirige). La autorización real la hacen la RLS y las RPCs de 021.

function revalidarApp() {
  revalidatePath("/app", "layout");
}

/** Cambia el perfil activo (cookie). `id` = propio o alguien con vínculo aceptado. */
export async function cambiarPerfilActivoAction(id: string): Promise<ResultadoFamilia> {
  const usuario = await requireUser();
  if (typeof id !== "string" || !id) return { status: "error", message: "Perfil inválido." };
  try {
    if (!(await esPerfilValido(id))) return { status: "error", message: "No tenés acceso a ese perfil." };
    const almacen = await cookies();
    if (id === usuario.id) {
      almacen.set(COOKIE_PERFIL_ACTIVO, "", { path: "/app", maxAge: 0 });
    } else {
      almacen.set(COOKIE_PERFIL_ACTIVO, id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/app",
        maxAge: 60 * 60 * 24 * 180,
      });
    }
  } catch {
    return { status: "error", message: "No pudimos cambiar de perfil." };
  }
  revalidarApp();
  return { status: "success" };
}

export type EstadoCrearPerfil = { status: "idle" } | ResultadoCrearPerfil;

const MAXIMO_PERFILES_A_CARGO = 20;

export async function crearPerfilGestionadoAction(
  _prev: EstadoCrearPerfil,
  formData: FormData
): Promise<EstadoCrearPerfil> {
  const usuario = await requireUser();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const relacion = String(formData.get("relacion") ?? "").trim();
  const color = String(formData.get("color") ?? "");
  const anioCrudo = String(formData.get("anioNacimiento") ?? "").trim();
  const anio = anioCrudo ? Number(anioCrudo) : null;
  const idsCondiciones = (formData.getAll("condiciones") as string[]).filter((id) =>
    CONDICIONES.some((c) => c.id === id && id !== "ninguna" && id !== "otra")
  );

  if (!nombre) return { status: "error", message: "Escribí su nombre." };
  if (!esColorPerfil(color)) return { status: "error", message: "Elegí un color." };
  if (anio !== null && (!Number.isInteger(anio) || anio < 1900 || anio > new Date().getFullYear())) {
    return { status: "error", message: "El año de nacimiento no es válido." };
  }

  let resultado: ResultadoCrearPerfil;
  try {
    // Tope simple: cada perfil es una cuenta de auth nueva (no hay rate-limit en el proyecto).
    const familia = await familiaNucleo.listarFamilia(await createClient());
    if (familia.length >= MAXIMO_PERFILES_A_CARGO) {
      return { status: "error", message: `Ya tenés ${MAXIMO_PERFILES_A_CARGO} perfiles a cargo, el máximo por ahora.` };
    }
    resultado = await familiaNucleo.crearPerfilGestionado(usuario.id, {
      nombre,
      relacion: relacion || null,
      color,
      anioNacimiento: anio,
      condiciones: idsCondiciones.map((id) => CONDICIONES.find((c) => c.id === id)!.label),
    });
  } catch {
    return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
  }
  if (resultado.status === "error") return resultado;

  // El perfil recién creado pasa a ser el activo: lo siguiente que se quiere
  // hacer es cargarle remedios y turnos.
  try {
    const almacen = await cookies();
    almacen.set(COOKIE_PERFIL_ACTIVO, resultado.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/app",
      maxAge: 60 * 60 * 24 * 180,
    });
  } catch {
    /* no crítico: se puede elegir desde el selector */
  }
  revalidarApp();
  return resultado;
}

/** Nombre/color de una persona que cuido (rol 'editar'; la RLS lo exige). */
export async function actualizarMiembroAction(
  elderId: string,
  datos: { nombre: string; color: string }
): Promise<ResultadoFamilia> {
  await requireUser();
  const nombre = typeof datos?.nombre === "string" ? datos.nombre.trim().slice(0, 60) : "";
  if (typeof elderId !== "string" || !nombre) return { status: "error", message: "Escribí su nombre." };
  if (!esColorPerfil(datos.color)) return { status: "error", message: "Elegí un color." };
  try {
    const supabase = await createClient();
    const familia = await familiaNucleo.listarFamilia(supabase);
    const miembro = familia.find((m) => m.id === elderId);
    if (!miembro) return { status: "error", message: "No tenés acceso a esta persona." };
    if (miembro.rol !== "editar") return { status: "error", message: "Tenés permiso de solo ver este perfil." };
    await perfilNucleo.actualizarPerfil(supabase, elderId, { nombre, color: datos.color });
  } catch {
    return { status: "error", message: "No pudimos guardar los cambios." };
  }
  revalidarApp();
  return { status: "success" };
}

/** La persona cuidada (cuenta logueada) cambia el permiso de uno de sus cuidadores. */
export async function cambiarRolCuidadorAction(vinculoId: string, rol: string): Promise<ResultadoFamilia> {
  await requireUser();
  if (typeof vinculoId !== "string" || !esRolVinculo(rol)) return { status: "error", message: "Permiso inválido." };
  try {
    const supabase = await createClient();
    const r = await familiaNucleo.cambiarRolCuidador(supabase, vinculoId, rol);
    if (r.status === "error") return r;
  } catch {
    return { status: "error", message: "No pudimos cambiar el permiso." };
  }
  revalidatePath("/app/familia");
  return { status: "success" };
}

/** El usuario logueado deja de cuidar a alguien. Si era el perfil activo, vuelve al propio. */
export async function dejarDeCuidarAction(vinculoId: string): Promise<ResultadoFamilia> {
  await requireUser();
  if (typeof vinculoId !== "string") return { status: "error", message: "Datos inválidos." };
  try {
    const supabase = await createClient();
    const r = await familiaNucleo.dejarDeCuidar(supabase, vinculoId);
    if (r.status === "error") return r;
    const almacen = await cookies();
    almacen.set(COOKIE_PERFIL_ACTIVO, "", { path: "/app", maxAge: 0 });
  } catch {
    return { status: "error", message: "No pudimos quitarlo de tu familia." };
  }
  revalidarApp();
  return { status: "success" };
}
