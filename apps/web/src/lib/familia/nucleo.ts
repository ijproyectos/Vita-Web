import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOMINIO_CUENTA_POR_CODIGO } from "@/lib/acceso-codigo/tipos";
import type { Condicion } from "@/lib/perfil/tipos";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { aplicaHoy, esDosisVencida, fechaEnUTC, filtrarDosisDeAyerVencidas, FIN_VENTANA_MEDIANOCHE, horaEnAR } from "@/lib/medicamentos/nucleo";
import type { Medicamento } from "@/lib/medicamentos/tipos";
import {
  esColorPerfil,
  type EstadoHoyPerfil,
  esRolVinculo,
  type ColorPerfil,
  type CuidadorDePersona,
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
    nombre: f.nombre?.trim() ? nombreConMayuscula(f.nombre) : "Sin nombre",
    color: esColorPerfil(f.color) ? f.color : null,
    rol: esRolVinculo(f.rol) ? f.rol : "ver",
    relacion: f.relacion,
    conectado: Boolean(f.conectado),
  }));
}

/**
 * Estado de hoy de varias personas con DOS consultas (medicamentos y tomas de
 * todas a la vez, la RLS decide qué filas ve el usuario): alimenta la línea
 * de estado del selector de perfiles ("2 de 5 hoy" / "Losacor 9:00 sin
 * marcar"). Nunca lanza: ante un error devuelve un mapa vacío.
 */
export async function estadoHoyPorPerfil(supabase: Cliente, ids: string[]): Promise<Map<string, EstadoHoyPerfil>> {
  const salida = new Map<string, EstadoHoyPerfil>();
  if (ids.length === 0) return salida;
  try {
    const [meds, tomas] = await Promise.all([
      supabase.from("medicamentos").select("*").in("usuario_id", ids),
      supabase.from("medicamentos_tomas").select("medicamento_id, tomado").in("usuario_id", ids).eq("fecha", fechaEnUTC()),
    ]);
    if (meds.error || tomas.error) return salida;
    const tomadas = new Set((tomas.data ?? []).filter((t) => t.tomado).map((t) => t.medicamento_id as string));
    const ahora = horaEnAR();
    // Ventana de medianoche: hasta las 00:30 AR cuentan también las dosis de
    // ayer sin tomar (la toma puede estar en la fecha UTC de ayer o de hoy).
    let tomadasVentana = tomadas;
    if (ahora < FIN_VENTANA_MEDIANOCHE) {
      const ayerUTC = fechaEnUTC(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const { data, error } = await supabase
        .from("medicamentos_tomas")
        .select("medicamento_id, tomado")
        .in("usuario_id", ids)
        .eq("fecha", ayerUTC);
      if (!error) {
        tomadasVentana = new Set([...tomadas, ...(data ?? []).filter((t) => t.tomado).map((t) => t.medicamento_id as string)]);
      }
    }
    for (const id of ids) {
      const deHoy = ((meds.data ?? []) as Medicamento[])
        .filter((m) => m.usuario_id === id && aplicaHoy(m))
        .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
      const deAyer = filtrarDosisDeAyerVencidas(
        ((meds.data ?? []) as Medicamento[]).filter((m) => m.usuario_id === id),
        tomadasVentana,
        new Date(),
        0
      ).sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
      const vencida =
        deAyer[0] ?? deHoy.find((m) => !tomadas.has(m.id) && esDosisVencida(m.hora_programada, ahora, 0));
      salida.set(id, {
        tomadas: deHoy.filter((m) => tomadas.has(m.id)).length,
        total: deHoy.length,
        vencida: vencida ? { nombre: vencida.nombre, hora: vencida.hora_programada.slice(0, 5) } : null,
      });
    }
  } catch {
    return new Map();
  }
  return salida;
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
    // Authoritative copy for RLS/RPCs (027): clients can't rewrite app_metadata.
    app_metadata: { tipo: "perfil_gestionado" },
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

// ── Cuidadores de una persona (migración 027) ──────────────────────────────

/** La RPC todavía no existe en la DB (migración sin aplicar). */
function rpcInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

type FilaCuidadorDe = {
  vinculo_id: string;
  cuidador_id: string | null;
  nombre: string | null;
  rol: string;
  relacion: string | null;
  estado: string;
  es_yo: boolean;
  puede_gestionar: boolean;
  email: string | null;
  token: string | null;
  expira_at: string | null;
  aceptado_at: string | null;
};

/**
 * Quiénes cuidan a `elderId` (aceptados + invitaciones pendientes si puedo
 * gestionar). `null` = la RPC no está disponible (027 sin aplicar o error):
 * la UI cae a mostrar solo a "vos". Nunca lanza.
 */
export async function listarCuidadoresDe(supabase: Cliente, elderId: string): Promise<CuidadorDePersona[] | null> {
  try {
    const { data, error } = await supabase.rpc("listar_cuidadores_de", { p_elder: elderId });
    if (error || !Array.isArray(data)) return null;
    return (data as FilaCuidadorDe[]).map((f) => ({
      vinculoId: f.vinculo_id,
      cuidadorId: f.cuidador_id,
      nombre: f.nombre?.trim() ? nombreConMayuscula(f.nombre) : f.estado === "pendiente" ? "Invitado" : "Sin nombre",
      rol: esRolVinculo(f.rol) ? f.rol : "ver",
      relacion: f.relacion,
      estado: f.estado === "pendiente" ? "pendiente" : "aceptado",
      esYo: Boolean(f.es_yo),
      puedeGestionar: Boolean(f.puede_gestionar),
      email: f.email,
      token: f.token,
      expiraAt: f.expira_at,
      aceptadoAt: f.aceptado_at,
    }));
  } catch {
    return null;
  }
}

export type ResultadoInvitacion =
  | { status: "success"; vinculoId: string; token: string; expiraAt: string }
  | { status: "error"; message: string };

const MENSAJES_INVITACION: Record<string, string> = {
  sin_permiso: "No tenés permiso para invitar cuidadores de esta persona.",
  rol_invalido: "Elegí un permiso.",
  email_invalido: "Ingresá un email válido.",
  ya_es_cuidador: "Esa persona ya la cuida o es la misma persona.",
};

/**
 * Crea (o reemite) una invitación para cuidar a `elderId` con rol/relación.
 * Usa la RPC de 027 (sirve también para un Admin de un perfil gestionado). Si
 * la RPC no existe todavía y la persona soy yo, cae al insert directo de 008.
 */
export async function invitarCuidador(
  supabase: Cliente,
  usuarioId: string,
  datos: { elderId: string; email: string; nombre: string; relacion: string | null; rol: RolVinculo }
): Promise<ResultadoInvitacion> {
  const { data, error } = await supabase.rpc("invitar_cuidador", {
    p_elder: datos.elderId,
    p_email: datos.email,
    p_nombre: datos.nombre,
    p_relacion: datos.relacion,
    p_rol: datos.rol,
  });
  if (!error && Array.isArray(data) && data[0]) {
    const f = data[0] as { vinculo_id: string; token: string; expira_at: string };
    return { status: "success", vinculoId: f.vinculo_id, token: f.token, expiraAt: f.expira_at };
  }
  if (rpcInexistente(error)) {
    if (datos.elderId !== usuarioId) {
      return { status: "error", message: "Todavía no se pueden invitar cuidadores a otra persona. Probá más tarde." };
    }
    try {
      const v = await cuidadoresNucleo.invitar(supabase, usuarioId, datos.email, {
        rol: datos.rol,
        relacion: datos.relacion,
      });
      return { status: "success", vinculoId: v.id, token: v.token, expiraAt: v.expira_at };
    } catch {
      return { status: "error", message: "No pudimos crear la invitación. Probá de nuevo." };
    }
  }
  const clave = Object.keys(MENSAJES_INVITACION).find((k) => (error?.message ?? "").includes(k));
  return { status: "error", message: clave ? MENSAJES_INVITACION[clave] : "No pudimos crear la invitación. Probá de nuevo." };
}

/**
 * Quita a OTRO cuidador (o cancela una invitación pendiente). Con la RPC de
 * 027; sin ella, solo la propia persona puede revocar (policy de 008).
 */
export async function quitarCuidador(
  supabase: Cliente,
  vinculoId: string,
  contexto: { elderId: string; usuarioId: string }
): Promise<ResultadoFamilia> {
  const { data, error } = await supabase.rpc("quitar_cuidador", { p_vinculo_id: vinculoId });
  if (!error && data === true) return { status: "success" };
  if (rpcInexistente(error) && contexto.elderId === contexto.usuarioId) {
    try {
      await cuidadoresNucleo.revocar(supabase, contexto.usuarioId, vinculoId);
      return { status: "success" };
    } catch {
      return { status: "error", message: "No pudimos quitarlo." };
    }
  }
  return { status: "error", message: "No pudimos quitarlo. Puede que no tengas permiso para hacerlo." };
}

/**
 * Lista de cuidadores de `personaId` lista para pintar. Si la RPC de 027 no
 * está disponible degrada: para el propio perfil usa `listar_mis_cuidadores`
 * (021) y para una persona a cargo muestra solo a "vos".
 */
export async function cuidadoresDePersona(
  supabase: Cliente,
  datos: { personaId: string; usuarioId: string; miNombre: string; miRol: RolVinculo; esPropio: boolean }
): Promise<{ lista: CuidadorDePersona[]; completa: boolean }> {
  const real = await listarCuidadoresDe(supabase, datos.personaId);
  if (real) return { lista: real, completa: true };
  if (datos.esPropio) {
    const mios = await listarMisCuidadores(supabase);
    return {
      completa: false,
      lista: mios.map((c) => ({
        vinculoId: c.vinculoId,
        cuidadorId: c.cuidadorId,
        nombre: c.nombre,
        rol: c.rol,
        relacion: c.relacion,
        estado: "aceptado" as const,
        esYo: false,
        puedeGestionar: true,
        email: null,
        token: null,
        expiraAt: null,
        aceptadoAt: null,
      })),
    };
  }
  return {
    completa: false,
    lista: [
      {
        vinculoId: "",
        cuidadorId: datos.usuarioId,
        nombre: datos.miNombre,
        rol: datos.miRol,
        relacion: null,
        estado: "aceptado",
        esYo: true,
        puedeGestionar: false,
        email: null,
        token: null,
        expiraAt: null,
        aceptadoAt: null,
      },
    ],
  };
}
