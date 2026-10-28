"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { rolSobre } from "@/lib/familia/perfil-activo";
import { COLORES_PERFIL, type ColorPerfil } from "@/lib/familia/tipos";
import * as medicamentosNucleo from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { extraerNombreEdad } from "@/lib/onboarding/extraer";
import { MEDICIONES_EN_CASA, type MedicionesEnCasa } from "@/lib/perfil/tipos";
import type { ConComida } from "@/lib/medicamentos/tipos";
import { normalizarTomas } from "@/lib/medicamentos/formulario";
import type { IndicacionComida } from "@/lib/medicamentos/comidas";

// Server Actions del onboarding conversacional nuevo — nunca lanzan (mismo
// criterio que ../actions.ts), cada una atrapa lo que su función de
// dominio pueda tirar y lo traduce a un shape tipado.

export type EstadoAccion = { status: "success" } | { status: "error"; message: string };

// --- Paso "persona": relación + nombre/edad -------------------------------

export type ResultadoExtraerNombreEdad =
  | { status: "success"; nombre: string; edad: number | null }
  | { status: "error"; message: string };

/**
 * Extrae nombre+edad de la respuesta en texto libre (ya tipeada, ya
 * transcripta de audio). No crea nada: la UI valida la edad y recién después
 * llama a `crearPerfilFamiliarAction`. Si la extracción falla o no reconoce un
 * nombre, la UI cae a un mini-form manual (nombre/edad) en vez de perder lo
 * que la persona dijo.
 */
export async function extraerNombreEdadAction(texto: string, relacion: string): Promise<ResultadoExtraerNombreEdad> {
  const usuario = await requireUser();
  const resultado = await extraerNombreEdad(usuario.id, texto, relacion);

  if (!resultado.ok) {
    return { status: "error", message: resultado.error };
  }
  if (!resultado.datos.nombre) {
    return { status: "error", message: "No pudimos reconocer un nombre en lo que escribiste." };
  }

  return { status: "success", nombre: resultado.datos.nombre, edad: resultado.datos.edad };
}

export type ResultadoCrearFamiliar =
  | { status: "success"; id: string; color: ColorPerfil }
  | { status: "error"; message: string };

const MAXIMO_PERFILES_A_CARGO = 20;
const EDAD_MAXIMA = 130;

/**
 * Primer color de la paleta que todavía no usa nadie de la familia del
 * usuario. El teal queda para el propio perfil; si se agotan los demás, cae
 * en el primero que no sea teal.
 */
function colorLibre(usados: (ColorPerfil | null)[]): ColorPerfil {
  const candidatos = COLORES_PERFIL.filter((c) => c !== "teal");
  return candidatos.find((c) => !usados.includes(c)) ?? candidatos[0];
}

/**
 * Crea a la persona que se cuida como PERFIL GESTIONADO real (cuenta de auth
 * + perfiles + vínculo aceptado con rol 'editar'), no como borrador: así todo
 * lo que sigue en la charla (condiciones, alergias, remedios, turno,
 * mediciones) se guarda directo en su perfil. La edad se aproxima a un año de
 * nacimiento. El color se asigna solo.
 */
export async function crearPerfilFamiliarAction(datos: {
  nombre: string;
  relacion: string;
  edad: number | null;
  /** Id del perfil creado en ESTA charla (lo guarda el cliente): único reusable en un reintento. */
  reutilizarId?: string | null;
}): Promise<ResultadoCrearFamiliar> {
  const usuario = await requireUser();
  const nombre = typeof datos?.nombre === "string" ? datos.nombre.trim() : "";
  if (!nombre) return { status: "error", message: "Escribí su nombre." };
  const edad = datos?.edad ?? null;
  if (edad !== null && (!Number.isInteger(edad) || edad < 0 || edad > EDAD_MAXIMA)) {
    return { status: "error", message: "La edad no es válida." };
  }

  try {
    const familia = await familiaNucleo.listarFamilia(await createClient());
    if (familia.length >= MAXIMO_PERFILES_A_CARGO) {
      return { status: "error", message: `Ya tenés ${MAXIMO_PERFILES_A_CARGO} perfiles a cargo, el máximo por ahora.` };
    }
    // Reintento dentro de la misma charla: solo se reusa el perfil que ESTA
    // charla creó (id que devuelve el cliente), con el mismo nombre y
    // relación, y mientras no tenga datos. Nunca por coincidencia de nombre:
    // dos "Juan, hermano" distintos son dos personas.
    const relacion = typeof datos.relacion === "string" ? datos.relacion : null;
    const existente =
      typeof datos.reutilizarId === "string"
        ? familia.find(
            (m) =>
              m.id === datos.reutilizarId &&
              m.rol === "editar" &&
              !m.conectado &&
              m.nombre.trim().toLowerCase() === nombre.toLowerCase() &&
              (m.relacion ?? null) === relacion
          )
        : undefined;
    if (existente && (await perfilNucleo.perfilVacio(await createClient(), existente.id))) {
      return { status: "success", id: existente.id, color: existente.color ?? colorLibre([]) };
    }

    const color = colorLibre(familia.map((m) => m.color));
    const resultado = await familiaNucleo.crearPerfilGestionado(usuario.id, {
      nombre,
      relacion,
      color,
      anioNacimiento: edad === null ? null : new Date().getFullYear() - edad,
      condiciones: [],
    });
    if (resultado.status === "error") return resultado;
    return { status: "success", id: resultado.id, color };
  } catch (e) {
    console.error("[onboarding] crearPerfilFamiliarAction", e);
    return { status: "error", message: "No pudimos crear el perfil. Probá de nuevo." };
  }
}

const MENSAJE_GENERICO = "No pudimos guardarlo. Probá de nuevo.";

function errorAmigable(contexto: string, e: unknown): { status: "error"; message: string } {
  console.error(`[onboarding] ${contexto}`, e);
  return { status: "error", message: MENSAJE_GENERICO };
}

/**
 * A quién se le escribe: la propia cuenta (sin `personaId`) o una persona a
 * cargo. Nunca se confía en el id del cliente: tiene que ser el propio usuario
 * o alguien con vínculo aceptado y rol 'editar' (`rolSobre` lo resuelve contra
 * `listar_familia`); la RLS lo vuelve a hacer cumplir en cada escritura.
 */
async function destinoDeEscritura(usuarioId: string, personaId?: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!personaId || personaId === usuarioId) return { ok: true, id: usuarioId };
  if (typeof personaId !== "string") return { ok: false, message: "Perfil inválido." };
  const rol = await rolSobre(personaId).catch(() => null);
  if (rol !== "editar") return { ok: false, message: "No tenés permiso para editar ese perfil." };
  return { ok: true, id: personaId };
}

// --- Medicamentos (compartido por el tab de la persona y el de "vos") ----

export type DatosMedicamentoConfirmado = {
  nombre: string;
  dosis: string | null;
  unidad: string;
  frecuencia: string | null;
  tomas: { hora: string; conComida: ConComida; indicacion?: IndicacionComida | null }[];
};

/**
 * Guarda un medicamento ya confirmado — escritura DIRECTA a `medicamentos`
 * reales, del propio usuario (tab "Vos") o de la persona a cargo (`personaId`):
 * reutiliza `agregarMultiMomento`, la misma función que usa el resto de la
 * app, nunca se reimplementa la creación.
 */
export async function guardarMedicamentoPropioAction(datos: DatosMedicamentoConfirmado, personaId?: string): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const destino = await destinoDeEscritura(usuario.id, personaId);
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();

  // Borde del sistema: las tomas vienen del cliente, se validan como `leerTomas`.
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
  if (!nombre) return { status: "error", message: "Falta el nombre del remedio." };
  const dosis = typeof datos.dosis === "string" ? datos.dosis.trim() : "";
  const unidad = typeof datos.unidad === "string" ? datos.unidad.trim() : "";
  const tomas = normalizarTomas(Array.isArray(datos.tomas) ? datos.tomas : []);
  if (tomas.length === 0) return { status: "error", message: "Falta al menos un horario." };

  try {
    await medicamentosNucleo.agregarMultiMomento(supabase, destino.id, {
      nombre,
      dosis: dosis || null,
      unidad: unidad || "mg",
      tomas,
      frecuencia: datos.frecuencia,
    });
  } catch (e) {
    return errorAmigable("guardarMedicamentoPropioAction", e);
  }

  return { status: "success" };
}

// --- Salud (condiciones, alergias, turno, mediciones) -----------------------
// Se preguntan igual para el propio usuario y para la persona a cargo:
// `personaId` (opcional) apunta al perfil gestionado y se autoriza en
// `destinoDeEscritura`.

export async function guardarCondicionesPropiasAction(labels: string[], personaId?: string): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const destino = await destinoDeEscritura(usuario.id, personaId);
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();
  try {
    // agregarCondicion ya omite las duplicadas.
    for (const label of labels) {
      await perfilNucleo.agregarCondicion(supabase, destino.id, {
        label,
        tipo: "permanente",
        desde: String(new Date().getFullYear()),
      });
    }
  } catch (e) {
    return errorAmigable("guardarCondicionesPropiasAction", e);
  }
  return { status: "success" };
}

export async function guardarAlergiasPropiasAction(alergias: string[], personaId?: string): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const destino = await destinoDeEscritura(usuario.id, personaId);
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();
  try {
    for (const alergia of alergias) {
      await perfilNucleo.agregarAlergia(supabase, destino.id, alergia);
    }
  } catch (e) {
    return errorAmigable("guardarAlergiasPropiasAction", e);
  }
  return { status: "success" };
}

// `fecha` es "YYYY-MM-DD" exacta (la elige la persona en el chat): como
// todavía no hay editar/eliminar turnos, nunca se guarda una fecha aproximada.
export async function guardarTurnoPropioAction(
  datos: {
    especialidad: string;
    fecha: string;
    hora: string;
    lugar: string | null;
  },
  personaId?: string
): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const destino = await destinoDeEscritura(usuario.id, personaId);
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();

  const especialidad = typeof datos?.especialidad === "string" ? datos.especialidad.trim() : "";
  if (!especialidad) return { status: "error", message: "Faltan datos del turno." };

  try {
    await turnosNucleo.agregar(supabase, destino.id, {
      especialidad,
      fecha: String(datos.fecha),
      hora: String(datos.hora),
      lugar: typeof datos.lugar === "string" ? datos.lugar.trim() || null : null,
    });
  } catch (e) {
    return errorAmigable("guardarTurnoPropioAction", e);
  }
  return { status: "success" };
}

// "¿Te medís la presión o el azúcar en casa?" (031). Si la columna no existe
// todavía, el núcleo lo omite sin error.
export async function guardarMedicionesEnCasaAction(valor: MedicionesEnCasa, personaId?: string): Promise<EstadoAccion> {
  const usuario = await requireUser();
  if (!MEDICIONES_EN_CASA.includes(valor)) return { status: "error", message: "Respuesta inválida." };
  const destino = await destinoDeEscritura(usuario.id, personaId);
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();
  try {
    await perfilNucleo.guardarMedicionesEnCasa(supabase, destino.id, valor);
  } catch (e) {
    return errorAmigable("guardarMedicionesEnCasaAction", e);
  }
  return { status: "success" };
}

// "¿Querés sumarte vos también?" -> uso_app pasa de "cuido" a "ambos".
export async function marcarUsoAmbosAction(): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();
  try {
    await perfilNucleo.guardarUsoApp(supabase, usuario.id, "ambos");
  } catch (e) {
    return errorAmigable("marcarUsoAmbosAction", e);
  }
  return { status: "success" };
}

// --- Finalización ----------------------------------------------------------

// Cierre de la charla (con o sin persona a cargo creada: ya es un perfil real,
// no hay borrador que threadear): marca el onboarding completo y va al paso de
// permiso, que sigue a /app.
export async function finalizarOnboardingAction(): Promise<EstadoAccion | void> {
  const usuario = await requireUser();
  const supabase = await createClient();
  try {
    await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  } catch (e) {
    return errorAmigable("finalizarOnboardingAction", e);
  }
  redirect("/onboarding/permiso");
}
