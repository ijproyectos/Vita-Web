"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as perfilesPendientesNucleo from "@/lib/onboarding/perfiles-pendientes";
import * as medicamentosNucleo from "@/lib/medicamentos/nucleo";
import { extraerMedicamentos, extraerNombreEdad, type MedicamentoExtraido } from "@/lib/onboarding/extraer";
import { HORA_POR_MOMENTO, type MomentoDia } from "@/lib/medicamentos/tipos";

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
 * transcripta de audio) y crea de una el perfil en borrador — mismo orden
 * que el mock (el mensaje "voy a crear el perfil de X" aparece apenas se
 * entiende el nombre, antes de la tarjeta de consentimiento). Si la
 * extracción falla o no reconoce un nombre, no crea nada: la UI cae a un
 * mini-form manual (nombre/edad) en vez de perder lo que la persona dijo.
 */
export async function extraerNombreEdadAction(texto: string, relacion: string): Promise<ResultadoExtraerNombreEdad> {
  await requireUser();
  const resultado = await extraerNombreEdad(texto, relacion);

  if (!resultado.ok) {
    return { status: "error", message: resultado.error };
  }
  if (!resultado.datos.nombre) {
    return { status: "error", message: "No pudimos reconocer un nombre en lo que escribiste." };
  }

  return { status: "success", nombre: resultado.datos.nombre, edad: resultado.datos.edad };
}

export type ResultadoCrearPerfilPendiente =
  | { status: "success"; perfilPendienteId: string }
  | { status: "error"; message: string };

export async function crearPerfilPendienteAction(datos: {
  nombre: string;
  relacion: string;
  edad: number | null;
}): Promise<ResultadoCrearPerfilPendiente> {
  const usuario = await requireUser();
  const supabase = await createClient();

  try {
    const perfil = await perfilesPendientesNucleo.crearPerfilPendiente(supabase, usuario.id, datos);
    return { status: "success", perfilPendienteId: perfil.id };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }
}

// --- Medicamentos (compartido por el tab de la persona y el de "vos") ----

export type ResultadoExtraerMedicamentos =
  | { status: "success"; medicamentos: MedicamentoExtraido[] }
  | { status: "error"; message: string };

export async function extraerMedicamentosAction(texto: string): Promise<ResultadoExtraerMedicamentos> {
  await requireUser();
  const resultado = await extraerMedicamentos(texto);

  if (!resultado.ok) {
    return { status: "error", message: resultado.error };
  }
  return { status: "success", medicamentos: resultado.datos };
}

export type DatosMedicamentoConfirmado = {
  nombre: string;
  dosis: string | null;
  unidad: string;
  momentos: MomentoDia[];
  frecuencia: string | null;
};

/**
 * Persiste un medicamento ya confirmado/editado por la persona para el
 * perfil en borrador — una fila en `medicamentos_pendientes` por momento
 * elegido, mismo criterio que `agregarMultiMomento` para medicamentos
 * reales (una fila = un horario puntual).
 */
export async function guardarMedicamentoPendienteAction(
  perfilPendienteId: string,
  datos: DatosMedicamentoConfirmado
): Promise<EstadoAccion> {
  await requireUser();
  const supabase = await createClient();

  try {
    for (const momento of datos.momentos) {
      await perfilesPendientesNucleo.agregarMedicamentoPendiente(supabase, perfilPendienteId, {
        nombre: datos.nombre,
        dosis: datos.dosis,
        unidad: datos.unidad,
        horaProgramada: HORA_POR_MOMENTO[momento],
        momentoDia: momento,
        frecuencia: datos.frecuencia,
      });
    }
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  return { status: "success" };
}

export type ResultadoContarMedicamentosPendientes = { status: "success"; cantidad: number } | { status: "error"; message: string };

/**
 * Recuenta desde la DB (no confía en un contador client-side, que podría
 * desincronizarse ante un guardado fallido a mitad de camino) cuántos
 * medicamentos quedaron cargados para el perfil en borrador — usado para
 * la tarjeta resumen ("N remedios") al terminar el tab de la persona.
 */
export async function contarMedicamentosPendientesAction(perfilPendienteId: string): Promise<ResultadoContarMedicamentosPendientes> {
  await requireUser();
  const supabase = await createClient();

  try {
    const medicamentos = await perfilesPendientesNucleo.listarMedicamentosPendientes(supabase, perfilPendienteId);
    return { status: "success", cantidad: medicamentos.length };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }
}

/**
 * Guarda un medicamento del propio cuidador (tab "Vos") — escritura
 * DIRECTA a `medicamentos` reales (usuario_id = su propia cuenta, ya
 * existe), sin staging: reutiliza `agregarMultiMomento`, la misma función
 * que usa el resto de la app, nunca se reimplementa la creación.
 */
export async function guardarMedicamentoPropioAction(datos: DatosMedicamentoConfirmado): Promise<EstadoAccion> {
  const usuario = await requireUser();
  const supabase = await createClient();

  try {
    await medicamentosNucleo.agregarMultiMomento(supabase, usuario.id, {
      nombre: datos.nombre,
      dosis: datos.dosis,
      unidad: datos.unidad,
      momentos: datos.momentos,
      frecuencia: datos.frecuencia,
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  return { status: "success" };
}

// --- Finalización ----------------------------------------------------------

// uso_app "cuido"/"ambos": marca el onboarding completo (recién acá, mismo
// punto que el guion viejo vía redirigirSegunUsoApp) y sigue a
// vincular-cuidado, threadeando el perfil en borrador para que el código
// generado quede linkeado a él (ver crearVinculoComoCuidador).
export async function finalizarConCuidadoAction(perfilPendienteId: string) {
  const usuario = await requireUser();
  const supabase = await createClient();
  await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  redirect(`/onboarding/vincular-cuidado?perfilPendienteId=${perfilPendienteId}`);
}

// uso_app "yo": marca el onboarding completo y va directo a /app (no hay
// nada que vincular).
export async function finalizarSoloYoAction() {
  const usuario = await requireUser();
  const supabase = await createClient();
  await perfilNucleo.completarOnboarding(supabase, usuario.id, {});
  redirect("/app");
}
