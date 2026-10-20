import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOMINIO_CUENTA_POR_CODIGO } from "@/lib/acceso-codigo/tipos";
import type { Condicion } from "@/lib/perfil/tipos";
import {
  esColorPerfil,
  esRolVinculo,
  type ColorPerfil,
  type MiCuidador,
  type MiembroFamilia,
  type ResultadoCrearPerfil,
  type ResultadoFamilia,
  type RolVinculo,
} from "./tipos";

// Núcleo del dominio Familia (migración 021). Lectura y cambios de vínculo
// van con el cliente de SESIÓN (RLS + RPCs security definer). La única
// excepción es `crearPerfilGestionado`, que necesita crear una cuenta de
// auth.users y por eso usa el cliente admin (uso sancionado, ver
// lib/supabase/admin.ts y CLAUDE.md).
type Cliente = SupabaseClient;

const LARGO_MAXIMO_NOMBRE = 60;
const LARGO_MAXIMO_RELACION = 30;

type FilaFamilia = {
  vinculo_id: string;
  elder_id: string;
  nombre: string | null;
  color: string | null;
  rol: string;
  relacion: string | null;
  conectado: boolean | null;
};

/** Personas que el usuario logueado cuida (vínculo aceptado). Nunca lanza: [] ante error. */
export async function listarFamilia(supabase: Cliente): Promise<MiembroFamilia[]> {
  const { data, error } = await supabase.rpc("listar_familia");
  if (error || !data) return [];
  return (data as FilaFamilia[]).map((f) => ({
    vinculoId: f.vinculo_id,
    id: f.elder_id,
    nombre: f.nombre?.trim() || "Sin nombre",
    color: esColorPerfil(f.color) ? f.color : null,
    rol: esRolVinculo(f.rol) ? f.rol : "ver",
    relacion: f.relacion,
    conectado: Boolean(f.conectado),
  }));
}

type FilaCuidador = {
  vinculo_id: string;
  cuidador_id: string;
  nombre: string | null;
  rol: string;
  relacion: string | null;
};

/** Quiénes cuidan al usuario logueado (vínculo aceptado). Nunca lanza: [] ante error. */
export async function listarMisCuidadores(supabase: Cliente): Promise<MiCuidador[]> {
  const { data, error } = await supabase.rpc("listar_mis_cuidadores");
  if (error || !data) return [];
  return (data as FilaCuidador[]).map((f) => ({
    vinculoId: f.vinculo_id,
    cuidadorId: f.cuidador_id,
    nombre: f.nombre?.trim() || "Sin nombre",
    rol: esRolVinculo(f.rol) ? f.rol : "ver",
    relacion: f.relacion,
  }));
}

/** La persona cuidada cambia el permiso de uno de sus cuidadores (RPC). */
export async function cambiarRolCuidador(
  supabase: Cliente,
  vinculoId: string,
  rol: RolVinculo
): Promise<ResultadoFamilia> {
  const { data, error } = await supabase.rpc("cambiar_rol_cuidador", { p_vinculo_id: vinculoId, p_rol: rol });
  if (error || data !== true) return { status: "error", message: "No pudimos cambiar el permiso." };
  return { status: "success" };
}

/** El cuidador deja de cuidar a alguien (revoca su propio vínculo aceptado). */
export async function dejarDeCuidar(supabase: Cliente, vinculoId: string): Promise<ResultadoFamilia> {
  const { data, error } = await supabase.rpc("dejar_de_cuidar", { p_vinculo_id: vinculoId });
  if (error || data !== true) return { status: "error", message: "No pudimos quitarlo de tu familia." };
  return { status: "success" };
}

export type DatosPerfilGestionado = {
  nombre: string;
  relacion: string | null;
  color: ColorPerfil;
  anioNacimiento: number | null;
  condiciones: string[];
};

/**
 * Crea un "perfil gestionado": una persona sin celular/cuenta propia que el
 * cuidador lleva desde su app. Es una cuenta REAL de auth.users (así todas
 * las tablas por usuario_id funcionan igual), con email placeholder no
 * entregable del mismo dominio que las cuentas por código y una contraseña
 * aleatoria que nadie ve. Pasos: cuenta → perfiles → vínculo aceptado
 * (cuidador_id = quien la crea, rol 'editar'). Si CUALQUIER paso falla, se
 * borra la cuenta (y por cascada lo que haya alcanzado a crear): nunca queda
 * una cuenta huérfana sin vínculo.
 *
 * USO ADMIN SANCIONADO (#4, ver lib/supabase/admin.ts): crear un usuario de
 * auth no se puede con RLS. El llamador ya autenticó a `cuidadorId` con la
 * sesión (requireUser); este módulo nunca recibe ids ajenos del cliente. Más
 * adelante esa persona puede entrar desde su celular con el código de acceso
 * existente (codigos_acceso), sin ningún mecanismo nuevo.
 */
export async function crearPerfilGestionado(
  cuidadorId: string,
  datos: DatosPerfilGestionado
): Promise<ResultadoCrearPerfil> {
  const nombre = datos.nombre.trim().slice(0, LARGO_MAXIMO_NOMBRE);
  if (!nombre) return { status: "error", message: "Escribí su nombre." };
  const relacion = datos.relacion?.trim().slice(0, LARGO_MAXIMO_RELACION) || null;

  const anioActual = new Date().getFullYear();
  const anio =
    datos.anioNacimiento !== null &&
    Number.isInteger(datos.anioNacimiento) &&
    datos.anioNacimiento >= 1900 &&
    datos.anioNacimiento <= anioActual
      ? datos.anioNacimiento
      : null;

  const condiciones: Condicion[] = datos.condiciones
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((label) => ({ label, tipo: "permanente", desde: "" }));

  let admin: Cliente;
  try {
    admin = createAdminClient();
  } catch {
    return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
  }

  const email = `gestionado-${randomUUID()}@${DOMINIO_CUENTA_POR_CODIGO}`;
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { tipo: "perfil_gestionado" },
  });
  if (errorCrear || !creado.user) return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
  const userId = creado.user.id;

  const limpiar = async () => {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  };

  try {
    const { error: errorPerfil } = await admin.from("perfiles").insert({
      id: userId,
      nombre,
      color: datos.color,
      edad_rango: anio ? `Nació en ${anio}` : null,
      condiciones,
      // La persona no pasa por el onboarding: si algún día entra con su
      // código de acceso, va directo a /app (o /app/modo-simple).
      uso_app: "yo",
      onboarding_completado_at: new Date().toISOString(),
    });
    if (errorPerfil) {
      await limpiar();
      return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
    }

    const { error: errorVinculo } = await admin.from("vinculos_cuidador").insert({
      elder_id: userId,
      cuidador_id: cuidadorId,
      email_invitado: "",
      estado: "aceptado",
      aceptado_at: new Date().toISOString(),
      rol: "editar",
      relacion,
    });
    if (errorVinculo) {
      await limpiar();
      return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
    }

    return { status: "success", id: userId };
  } catch {
    await limpiar();
    return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
  }
}
