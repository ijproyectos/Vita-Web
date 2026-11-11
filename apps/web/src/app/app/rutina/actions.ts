"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { PASTILLAS_POR_TOMA_MAXIMO, STOCK_MAXIMO } from "@/lib/inventario/tipos";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import type { ItemLlevar } from "@/lib/turnos/tipos";
import { leerTurnoDelFormulario } from "@/lib/turnos/formulario";
import { leerTomas, leerPlanMedicamento } from "@/lib/medicamentos/formulario";
import { mensajeSeguroMedicamento } from "@/lib/medicamentos/duplicados";
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

/** Ids de un grupo del modo simple: sin repetidos ni vacíos, como mucho 20. */
function idsDeGrupo(medicamentoIds: string[]): string[] {
  return [...new Set(medicamentoIds.filter((id) => typeof id === "string" && id))].slice(0, 20);
}

/** Dueño editable de cada dosis del grupo; si alguna no se puede tocar, el mensaje de la primera. */
async function duenosEditables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<{ ok: true; objetivos: { id: string; usuarioId: string }[] } | { ok: false; message: string }> {
  const objetivos = await Promise.all(ids.map((id) => duenioEditable(supabase, id)));
  const objetivosOk: { id: string; usuarioId: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const o = objetivos[i];
    if (!o.ok) return { ok: false, message: o.message };
    objetivosOk.push({ id: ids[i], usuarioId: o.usuarioId });
  }
  return { ok: true, objetivos: objetivosOk };
}

/**
 * `fechaDosis` (opcional, "YYYY-MM-DD"): la tarjeta "Era ayer" marca la dosis
 * de AYER; `marcarTomado` re-valida (`fechaDeTomaEnAR`) que sea ayer AR y que
 * estemos en la ventana 00:00-00:29, si no cae a hoy — el cliente no decide.
 */
export async function marcarTomadoAction(medicamentoId: string, tomado: boolean, fechaDosis?: string): Promise<EstadoAccion> {
  await requireUser();
  const supabase = await createClient();
  try {
    const objetivo = await duenioEditable(supabase, medicamentoId);
    if (!objetivo.ok) return { status: "error", message: objetivo.message };
    await medicamentos.marcarTomado(supabase, objetivo.usuarioId, medicamentoId, tomado, fechaDosis);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo registrar la toma." };
  }
  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/modo-simple");
  return { status: "success" };
}

/**
 * Modo simple, "Ya tomé las N": todo el grupo en UNA acción. Next despacha las
 * Server Actions de a una por cliente, así que N llamadas a `marcarTomadoAction`
 * eran N viajes en fila, cada uno re-renderizando la pantalla. Acá se valida y
 * se marca en paralelo dentro del servidor, y NO se revalida: la página del
 * modo simple se refresca sola después (`router.refresh`) y las demás son
 * dinámicas, así que la respuesta no trae un re-render que nadie mira.
 * `tomado = false` lo deshace ("Me equivoqué"): devuelve el stock como siempre.
 * `fechaDosis` = la dosis de AYER en la ventana de medianoche (marcarTomado la re-valida).
 */
export async function marcarGrupoTomadoAction(medicamentoIds: string[], tomado = true, fechaDosis?: string): Promise<EstadoAccion> {
  await requireUser();
  const ids = idsDeGrupo(medicamentoIds);
  if (ids.length === 0) return { status: "success" };
  const supabase = await createClient();
  try {
    const grupo = await duenosEditables(supabase, ids);
    if (!grupo.ok) return { status: "error", message: grupo.message };
    const resultados = await Promise.allSettled(
      grupo.objetivos.map((o) => medicamentos.marcarTomado(supabase, o.usuarioId, o.id, tomado === true, fechaDosis))
    );
    if (resultados.some((r) => r.status === "rejected")) {
      return { status: "error", message: "No se pudo registrar toda la toma." };
    }
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo registrar la toma." };
  }
  return { status: "success" };
}

/**
 * Modo simple, "No la tomé": el grupo queda como no tomado a propósito (ver
 * `marcarNoTomada`). Sin revalidar, igual que confirmar: la pantalla se refresca sola.
 */
export async function marcarGrupoNoTomadoAction(medicamentoIds: string[], fechaDosis?: string): Promise<EstadoAccion> {
  await requireUser();
  const ids = idsDeGrupo(medicamentoIds);
  if (ids.length === 0) return { status: "success" };
  const supabase = await createClient();
  try {
    const grupo = await duenosEditables(supabase, ids);
    if (!grupo.ok) return { status: "error", message: grupo.message };
    const resultados = await Promise.allSettled(
      grupo.objetivos.map((o) => medicamentos.marcarNoTomada(supabase, o.usuarioId, o.id, fechaDosis))
    );
    const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (fallo) return { status: "error", message: "No se pudo guardar. Probá de nuevo o avisale a tu familia." };
  } catch {
    return { status: "error", message: "No se pudo guardar. Probá de nuevo o avisale a tu familia." };
  }
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
import type { EstadoAccion } from "@/lib/acciones";
// Vive en lib/acciones.ts; se re-exporta para los imports viejos.
export type { EstadoAccion } from "@/lib/acciones";

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
  let tomas: ReturnType<typeof leerTomas>;
  try {
    tomas = leerTomas(formData);
  } catch (e) {
    return { status: "error", message: mensajeSeguroMedicamento(e, "Revisá los horarios.") };
  }
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
    Number.isFinite(stockInicial) &&
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
      ...leerPlanMedicamento(formData),
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
    return { status: "error", message: mensajeSeguroMedicamento(e, "No pudimos guardar el medicamento. Probá de nuevo.") };
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
  const lectura = leerTurnoDelFormulario(formData);
  if (!lectura.ok) return { status: "error", message: lectura.message };

  try {
    const supabase = await createClient();
    await turnosNucleo.agregar(supabase, destino.perfil.id, lectura.datos);
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
