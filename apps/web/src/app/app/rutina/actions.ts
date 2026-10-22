"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { PASTILLAS_POR_TOMA_MAXIMO, STOCK_MAXIMO } from "@/lib/inventario/tipos";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { normalizarLlevar, validarTelefono, type ItemLlevar } from "@/lib/turnos/tipos";
import { leerTomas } from "@/lib/medicamentos/formulario";
import { MENSAJE_SOLO_LECTURA, perfilActivoEditable, rolSobre } from "@/lib/familia/perfil-activo";

// Compartidas entre Home y Rutina — ambas pantallas muestran y togglean
// los mismos medicamentos/turnos de hoy.
//
// Familia (021): las altas escriben sobre el PERFIL ACTIVO; las acciones
// sobre una fila existente (marcar toma, borrar) escriben sobre el DUEÑO de
// esa fila (Modo simple marca siempre lo propio aunque el perfil activo sea
// otro). En ambos casos un permiso 'ver' devuelve un error amable; la RLS
// (puede_editar_de) es la autoridad final.

/** Dueño del medicamento + permiso de escritura, o mensaje de error. */
async function duenioEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  medicamentoId: string
): Promise<{ ok: true; usuarioId: string } | { ok: false; message: string }> {
  const duenio = await medicamentos.duenioDeMedicamento(supabase, medicamentoId);
  if (!duenio) return { ok: false, message: "No encontramos ese medicamento." };
  const rol = await rolSobre(duenio);
  if (rol !== "editar") return { ok: false, message: MENSAJE_SOLO_LECTURA };
  return { ok: true, usuarioId: duenio };
}

export async function marcarTomadoAction(medicamentoId: string, tomado: boolean): Promise<EstadoAccion> {
  await requireUser();
  const supabase = await createClient();
  try {
    const objetivo = await duenioEditable(supabase, medicamentoId);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await medicamentos.marcarTomado(supabase, objetivo.usuarioId, medicamentoId, tomado);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo registrar la toma." };
  }
  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/modo-simple");
  return { status: "success" };
}

// Marcar todos los pendientes de hoy de una — el diálogo/botón viejo
// (marcar-todos-button.tsx) se había perdido al migrar de Medicamentos a
// Rutina; el hallazgo del review lo marcó como regresión real, no un
// recorte de alcance deliberado.
export async function marcarTodosTomadosAction(): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();
  try {
    await medicamentos.marcarTodosTomados(supabase, destino.perfil.id);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo marcar todo como tomado." };
  }
  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/modo-simple");
  return { status: "success" };
}

// Mismo motivo — no había ningún camino para borrar un medicamento
// cargado por error desde que se retiró el módulo viejo de Medicamentos.
export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export async function eliminarMedicamentoAction(medicamentoId: string): Promise<EstadoAccion> {
  await requireUser();
  try {
    const supabase = await createClient();
    const objetivo = await duenioEditable(supabase, medicamentoId);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await medicamentos.eliminarHorario(supabase, objetivo.usuarioId, medicamentoId);
  } catch {
    return { status: "error", message: "No se pudo eliminar el medicamento. Probá de nuevo." };
  }
  revalidatePath("/app");
  revalidatePath("/app/rutina");
  return { status: "success" };
}

export async function crearMedicamentoAction(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const usuarioId = destino.perfil.id;
  const supabase = await createClient();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const dosis = String(formData.get("dosis") ?? "").trim();
  const unidad = String(formData.get("unidad") ?? "mg");
  const frecuencia = String(formData.get("frecuencia") ?? "");
  const tomas = leerTomas(formData);
  const duracion = String(formData.get("duracion") ?? "");
  const notas = String(formData.get("notas") ?? "").trim();

  if (!nombre || tomas.length === 0) {
    return { status: "error", message: "El nombre y al menos un horario son obligatorios." };
  }

  // Stock contado desde "Mis pastillas" (medicamento nuevo detectado en un
  // blister): llega como campos ocultos y se valida acá, en el borde.
  const stockCrudo = String(formData.get("stockInicial") ?? "").trim();
  const porTomaCrudo = String(formData.get("pastillasPorToma") ?? "").trim();
  const stockInicial = Number(stockCrudo);
  const porToma = Number(porTomaCrudo || "1");
  const hayStock =
    stockCrudo !== "" &&
    Number.isInteger(stockInicial) &&
    stockInicial >= 0 &&
    stockInicial <= STOCK_MAXIMO &&
    Number.isInteger(porToma) &&
    porToma >= 1 &&
    porToma <= PASTILLAS_POR_TOMA_MAXIMO;

  try {
    const filas = await medicamentos.agregarMultiMomento(supabase, usuarioId, {
      nombre,
      dosis: dosis || null,
      unidad,
      tomas,
      frecuencia: frecuencia || null,
      duracion: duracion || null,
      notas: notas || null,
    });

    // Best-effort: el medicamento ya existe; si el stock no se pudo guardar
    // (p. ej. migración 014 sin aplicar) se puede volver a contar desde Mis pastillas.
    if (hayStock && filas[0]) {
      try {
        await inventarioNucleo.guardar(supabase, usuarioId, {
          medicamentoId: filas[0].id,
          stock: stockInicial,
          pastillasPorToma: porToma,
        });
      } catch {
        /* se ignora a propósito, ver comentario */
      }
    }
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/pastillas");
  return { status: "success" };
}

export async function crearTurnoAction(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  await requireUser();
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const supabase = await createClient();

  const especialidad = String(formData.get("especialidad") ?? "").trim();
  const profesional = String(formData.get("profesional") ?? "").trim();
  const lugar = String(formData.get("lugar") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  const hora = String(formData.get("hora") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const recordatorio = String(formData.get("recordatorio") ?? "");
  const acompanado = formData.get("acompanado") === "on";
  const notas = String(formData.get("notas") ?? "").trim();
  const telefonoCrudo = formData.get("telefono");
  const tel = typeof telefonoCrudo === "string" ? validarTelefono(telefonoCrudo) : null;
  if (tel && !tel.ok) return { status: "error", message: tel.message };
  // "Qué hay que llevar": JSON del formulario; sin el campo no se toca la columna.
  let llevar: ItemLlevar[] | undefined;
  const llevarCrudo = formData.get("llevar");
  if (typeof llevarCrudo === "string") {
    try {
      llevar = normalizarLlevar(JSON.parse(llevarCrudo));
    } catch {
      llevar = undefined;
    }
  }

  if (!especialidad || !fecha || !hora) {
    return { status: "error", message: "Especialidad, fecha y hora son obligatorios." };
  }

  try {
    await turnosNucleo.agregar(supabase, destino.perfil.id, {
      especialidad,
      profesional: profesional || null,
      lugar: lugar || null,
      fecha,
      hora,
      motivo: motivo || null,
      recordatorio: recordatorio || null,
      acompanado,
      notas: notas || null,
      ...(llevar !== undefined ? { llevar } : {}),
      ...(tel && tel.ok && tel.valor ? { telefono: tel.valor } : {}),
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Error desconocido." };
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  return { status: "success" };
}

/**
 * Guarda el checklist "Qué llevar" de un turno (hoja de detalle). Escribe
 * sobre el DUEÑO del turno (como las acciones sobre medicamentos) y exige
 * permiso de edición; con la migración 023 sin aplicar devuelve un error amable.
 */
export async function guardarLlevarAction(turnoId: string, llevar: ItemLlevar[]): Promise<EstadoAccion> {
  await requireUser();
  try {
    const supabase = await createClient();
    const duenio = await turnosNucleo.duenioDeTurno(supabase, turnoId);
    if (!duenio) return { status: "error", message: "No encontramos ese turno." };
    const rol = await rolSobre(duenio);
    if (rol !== "editar") return { status: "error", message: MENSAJE_SOLO_LECTURA };
    await turnosNucleo.actualizar(supabase, duenio, turnoId, { llevar });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar la lista." };
  }
  revalidatePath("/app/rutina");
  revalidatePath("/app");
  return { status: "success" };
}
