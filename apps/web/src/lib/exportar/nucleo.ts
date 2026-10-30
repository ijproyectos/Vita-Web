import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { listarElders } from "@/lib/cuidadores/nucleo";
import { leerResumen } from "@/lib/memoria/resumen";
import type { Perfil } from "@/lib/perfil/tipos";
import type { Medicamento } from "@/lib/medicamentos/tipos";
import type { Turno } from "@/lib/turnos/tipos";
import type { Estudio } from "@/lib/estudios/tipos";
import type { Inventario } from "@/lib/inventario/tipos";
import type { MensajeChat } from "@/lib/chat/tipos";
import type { EstadoVinculo } from "@/lib/cuidadores/tipos";

// Núcleo de la exportación del historial: compartido por la página
// imprimible (/app/perfil/historial) y el endpoint JSON. Todo se lee con
// el cliente del usuario (sujeto a RLS), nunca con service_role: solo
// puede salir lo que el propio usuario ya puede ver.
type Cliente = SupabaseClient;

const PAGINA = 1000; // tope por request de PostgREST

export type TomaExportada = {
  id: string;
  medicamento_id: string;
  medicamento: string;
  fecha: string;
  tomado: boolean;
  tomado_en: string | null;
};

export type CuidadorExportado = {
  email_invitado: string;
  estado: EstadoVinculo;
  invitado_el: string;
  aceptado_el: string | null;
};

export type BorradorExportado = {
  nombre: string;
  relacion: string | null;
  edad: number | null;
  estado: string;
  creado_el: string;
  medicamentos: {
    nombre: string;
    dosis: string | null;
    unidad: string;
    hora_programada: string;
    momento_dia: string;
    con_comida: string;
    frecuencia: string | null;
    duracion: string | null;
    notas: string | null;
  }[];
};

export type ConversacionExportada = {
  id: string;
  iniciada_el: string;
  mensajes: Pick<MensajeChat, "role" | "contenido" | "created_at">[];
};

/** Recuerdos de vita (vigentes y reemplazados; un recuerdo borrado no conserva texto, así que no hay nada para exportar). */
export type RecuerdoExportado = {
  id: string;
  sobre: string;
  tema: string;
  texto: string;
  tipo: string;
  estado: "vigente" | "reemplazado";
  vence_el: string | null;
  origen: string;
  corrige_a: string | null;
  creado_el: string;
};

/** Resumen automático de las charlas con vita (memoria, fase 3). */
export type ResumenExportado = { resumen: string; pendientes: string[]; actualizado_el: string };

export type EstudioExportado = Omit<Estudio, "usuario_id" | "archivo_path">;

export type HistorialExportado = {
  generado_en: string;
  cuenta: { email: string | null };
  perfil: Omit<Perfil, "id"> | null;
  medicamentos: Omit<Medicamento, "usuario_id">[];
  stock_pastillas: Omit<Inventario, "usuario_id">[];
  tomas: TomaExportada[];
  turnos: Omit<Turno, "usuario_id">[];
  estudios: EstudioExportado[];
  cuidadores: CuidadorExportado[];
  personas_que_cuido: { nombre: string }[];
  borradores_de_personas_que_cuido: BorradorExportado[];
  conversaciones: ConversacionExportada[];
  /** Lo que vita recuerda de vos (solo del dueño: ni cuidadores ni la persona cuidada lo ven). Vacío sin la migración 038. */
  recuerdos_de_vita: RecuerdoExportado[];
  /** Resumen de las charlas con vita (solo del dueño). null si no hay o falta la migración 041. */
  resumen_de_charlas_con_vita: ResumenExportado | null;
};

type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Lee todas las filas de una consulta, pagina por pagina. */
async function leerTodas<T>(etiqueta: string, consulta: (desde: number, hasta: number) => Pagina): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(`No se pudo leer ${etiqueta}: ${error.message}`);
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return filas;
}

/**
 * Reúne TODOS los datos del usuario en una estructura serializable. Lanza
 * si alguna lectura falla: un export incompleto sin avisar sería peor que
 * un error explícito (quien llama decide cómo mostrarlo).
 */
export async function obtenerHistorial(supabase: Cliente, usuarioId: string): Promise<HistorialExportado> {
  const [
    authRes,
    perfilRes,
    medicamentos,
    tomas,
    turnos,
    estudios,
    inventario,
    vinculos,
    elders,
    pendientes,
    sesiones,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("perfiles").select("*").eq("id", usuarioId).maybeSingle(),
    leerTodas<Medicamento>("tus medicamentos", (d, h) =>
      supabase
        .from("medicamentos")
        .select("*")
        .eq("usuario_id", usuarioId)
        .order("nombre", { ascending: true })
        .order("hora_programada", { ascending: true })
        .range(d, h)
    ),
    leerTodas<{ id: string; medicamento_id: string; fecha: string; tomado: boolean; tomado_en: string | null }>(
      "tu historial de tomas",
      (d, h) =>
        supabase
          .from("medicamentos_tomas")
          .select("id, medicamento_id, fecha, tomado, tomado_en")
          .eq("usuario_id", usuarioId)
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false })
          .range(d, h)
    ),
    leerTodas<Turno>("tus turnos", (d, h) =>
      supabase
        .from("turnos")
        .select("*")
        .eq("usuario_id", usuarioId)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false })
        .range(d, h)
    ),
    leerTodas<Estudio>("tus estudios", (d, h) =>
      supabase
        .from("estudios")
        .select("*")
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: false })
        .range(d, h)
    ),
    leerTodas<Inventario>("tu stock de pastillas", (d, h) =>
      supabase.from("inventario_pastillas").select("*").eq("usuario_id", usuarioId).order("nombre").range(d, h)
    ),
    leerTodas<{
      email_invitado: string;
      estado: EstadoVinculo;
      created_at: string;
      aceptado_at: string | null;
    }>("tus cuidadores", (d, h) =>
      supabase
        .from("vinculos_cuidador")
        .select("email_invitado, estado, created_at, aceptado_at")
        .eq("elder_id", usuarioId)
        .order("created_at", { ascending: false })
        .range(d, h)
    ),
    listarElders(supabase, usuarioId),
    leerTodas<{
      id: string;
      nombre: string;
      relacion: string | null;
      edad: number | null;
      estado: string;
      created_at: string;
    }>("tus borradores", (d, h) =>
      supabase
        .from("perfiles_pendientes")
        .select("id, nombre, relacion, edad, estado, created_at")
        .eq("cuidador_id", usuarioId)
        .order("created_at", { ascending: false })
        .range(d, h)
    ),
    leerTodas<{ id: string; created_at: string }>("tus conversaciones", (d, h) =>
      supabase
        .from("sesiones_chat")
        .select("id, created_at")
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: false })
        .range(d, h)
    ),
  ]);

  if (perfilRes.error) throw new Error(`No se pudo leer tu perfil: ${perfilRes.error.message}`);

  // Medicamentos de los borradores y mensajes de cada conversación:
  // dependen de las listas anteriores, así que van en una segunda tanda.
  const idsPendientes = pendientes.map((p) => p.id);
  const [medicamentosPendientes, mensajes] = await Promise.all([
    idsPendientes.length === 0
      ? Promise.resolve([] as (BorradorExportado["medicamentos"][number] & { perfil_pendiente_id: string })[])
      : leerTodas<BorradorExportado["medicamentos"][number] & { perfil_pendiente_id: string }>(
          "los medicamentos de tus borradores",
          (d, h) =>
            supabase
              .from("medicamentos_pendientes")
              .select(
                "perfil_pendiente_id, nombre, dosis, unidad, hora_programada, momento_dia, con_comida, frecuencia, duracion, notas"
              )
              .in("perfil_pendiente_id", idsPendientes)
              .order("created_at", { ascending: true })
              .range(d, h)
        ),
    leerTodas<MensajeChat>("tus mensajes con vita", (d, h) =>
      supabase
        .from("mensajes_chat")
        .select("*")
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: true })
        .range(d, h)
    ),
  ]);

  // Memoria de vita (038): sin la migración (tabla inexistente) o ante cualquier falla de lectura no se exporta nada;
  // el resto del export sigue igual. La RLS es owner-only: al exportar a alguien que se cuida, esto sale vacío.
  let recuerdos: RecuerdoExportado[] = [];
  try {
    const filas = await leerTodas<{
      id: string;
      sobre_tipo: string;
      sobre_nombre: string | null;
      clave: string;
      texto: string | null;
      tipo: string;
      estado: "vigente" | "reemplazado" | "borrado";
      vence_at: string | null;
      origen: string;
      corrige_id: string | null;
      created_at: string;
    }>("tus recuerdos", (d, h) =>
      supabase
        .from("memorias")
        .select("id, sobre_tipo, sobre_nombre, clave, texto, tipo, estado, vence_at, origen, corrige_id, created_at")
        .eq("usuario_id", usuarioId)
        .in("estado", ["vigente", "reemplazado"])
        .order("created_at", { ascending: true })
        .range(d, h)
    );
    recuerdos = filas
      .filter((m) => m.texto)
      .map((m) => ({
        id: m.id,
        sobre: m.sobre_tipo === "yo" ? "vos" : (m.sobre_nombre ?? "un familiar"),
        tema: m.clave,
        texto: m.texto as string,
        tipo: m.tipo,
        estado: m.estado as "vigente" | "reemplazado",
        vence_el: m.vence_at,
        origen: m.origen,
        corrige_a: m.corrige_id,
        creado_el: m.created_at,
      }));
  } catch {
    recuerdos = [];
  }

  let resumenCharlas: ResumenExportado | null = null;
  try {
    const guardado = await leerResumen(supabase, usuarioId);
    if (guardado) resumenCharlas = { resumen: guardado.resumen, pendientes: guardado.pendientes, actualizado_el: guardado.actualizadoEl };
  } catch {
    resumenCharlas = null;
  }

  const nombrePorMedicamento = new Map(medicamentos.map((m) => [m.id, m.nombre]));

  const mensajesPorSesion = new Map<string, MensajeChat[]>();
  for (const m of mensajes) {
    const lista = mensajesPorSesion.get(m.sesion_id) ?? [];
    lista.push(m);
    mensajesPorSesion.set(m.sesion_id, lista);
  }

  const perfilFila = perfilRes.data as Perfil | null;
  let perfilExportado: HistorialExportado["perfil"] = null;
  if (perfilFila) {
    const { id: _id, ...resto } = perfilFila;
    void _id;
    perfilExportado = resto;
  }

  return {
    generado_en: new Date().toISOString(),
    // Solo el mail de la sesión si el export es del propio usuario; al exportar a
    // alguien que se cuida no se le atribuye el mail de quien exporta.
    cuenta: {
      email:
        authRes.data.user?.id !== usuarioId || esEmailDeCuentaPorCodigo(authRes.data.user?.email)
          ? null
          : (authRes.data.user?.email ?? null),
    },
    perfil: perfilExportado,
    medicamentos: medicamentos.map(({ usuario_id: _u, ...m }) => {
      void _u;
      return m;
    }),
    stock_pastillas: inventario.map(({ usuario_id: _u, ...i }) => {
      void _u;
      return i;
    }),
    tomas: tomas.map((t) => ({
      ...t,
      medicamento: nombrePorMedicamento.get(t.medicamento_id) ?? "Medicamento",
    })),
    turnos: turnos.map(({ usuario_id: _u, ...t }) => {
      void _u;
      return t;
    }),
    // El archivo (foto) no se exporta; tampoco su ruta interna en Storage.
    estudios: estudios.map(({ usuario_id: _u, archivo_path: _a, ...e }) => {
      void _u;
      void _a;
      return e;
    }),
    cuidadores: vinculos.map((v) => ({
      email_invitado: v.email_invitado,
      estado: v.estado,
      invitado_el: v.created_at,
      aceptado_el: v.aceptado_at,
    })),
    personas_que_cuido: elders.map((e) => ({ nombre: e.nombre })),
    borradores_de_personas_que_cuido: pendientes.map((p) => ({
      nombre: p.nombre,
      relacion: p.relacion,
      edad: p.edad,
      estado: p.estado,
      creado_el: p.created_at,
      medicamentos: medicamentosPendientes
        .filter((m) => m.perfil_pendiente_id === p.id)
        .map(({ perfil_pendiente_id: _p, ...m }) => {
          void _p;
          return m;
        }),
    })),
    conversaciones: sesiones
      .map((s) => ({
        id: s.id,
        iniciada_el: s.created_at,
        mensajes: (mensajesPorSesion.get(s.id) ?? []).map((m) => ({
          role: m.role,
          contenido: m.contenido,
          created_at: m.created_at,
        })),
      }))
      .filter((c) => c.mensajes.length > 0),
    recuerdos_de_vita: recuerdos,
    resumen_de_charlas_con_vita: resumenCharlas,
  };
}
