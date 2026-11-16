import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { horaEnAR } from "@/lib/medicamentos/fechas";
import { entregarAviso, obtenerPreferenciasDe, reclamarEnvio } from "@/lib/notificaciones/avisos";
import { PREFERENCIAS_POR_DEFECTO } from "@/lib/notificaciones/avisos-tipos";
import { esErrorTablaInexistente } from "@/lib/notificaciones/retencion";
import { fechaEnAR } from "@/lib/tiempo-ar";
import { TIPOS_CON_PUSH } from "./constantes";
import {
  CURSOR_FIN,
  CURSOR_INICIAL,
  MINIMO_PARA_OTRO_LOTE_MS,
  PRESUPUESTO_CRON_MS,
  RESERVA_PUSH_MS,
  TAMANO_LOTE,
  TIPO_ENVIO_CURSOR,
  TIPO_ENVIO_PUSH,
  corteDeRetencion,
  destinosDePush,
  elegirParaPush,
  payloadObservacion,
  planificarCambios,
  procesarTolerante,
  textosDeAviso,
  type CandidataPush,
} from "./generar-logica";
import { evaluarReglas, sumarDias } from "./reglas";
import type { DatosPersonaObs, ObservacionNueva } from "./tipos";

// Generador de observaciones (etapa 1, sin IA). Lo invoca SOLO `/api/cron/observaciones` con el cliente admin
// (uso sancionado: ver `lib/supabase/admin.ts`). Por cada persona lee sus datos, evalúa las reglas puras de
// `reglas.ts` y guarda el resultado en `observaciones` (la tabla no tiene policy de insert: solo service_role).
//
// Cursor: las personas se recorren por lotes en orden de id. Después de cada lote se anota en `envios_avisos`
// (tipo `observaciones_lote`, ref = último id del lote, fecha AR de hoy) hasta dónde se llegó; el tick siguiente
// retoma de ahí, así una corrida que no alcanza a terminar sigue en la próxima. Es idempotente: guardar es un upsert
// por (usuario_id, clave) y los push se reclaman antes de enviar.

type Cliente = SupabaseClient;
type ErrorDb = { code?: string; message: string };
type Pagina = PromiseLike<{ data: unknown[] | null; error: ErrorDb | null }>;

const PAGINA = 1000;
const DIA_MS = 86_400_000;

async function leerPaginas<T>(consulta: (desde: number, hasta: number) => Pagina): Promise<{ filas: T[]; error: ErrorDb | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) return { filas, error };
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return { filas, error: null };
}

/** Lee con las columnas completas y, si alguna migración no está aplicada, reintenta con las básicas. Tabla ausente = []. */
async function leerConFallback<T>(
  completas: (desde: number, hasta: number) => Pagina,
  basicas: ((desde: number, hasta: number) => Pagina) | null,
  etiqueta: string
): Promise<T[]> {
  let r = await leerPaginas<T>(completas);
  if (r.error && basicas && !esErrorTablaInexistente(r.error)) r = await leerPaginas<T>(basicas);
  if (r.error) {
    if (esErrorTablaInexistente(r.error)) return [];
    throw new Error(`No se pudo leer ${etiqueta}: ${r.error.message}`);
  }
  return r.filas;
}

function agrupar<T extends { usuario_id: string }>(filas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const f of filas) {
    const l = mapa.get(f.usuario_id) ?? [];
    l.push(f);
    mapa.set(f.usuario_id, l);
  }
  return mapa;
}

type Persona = { id: string; nombre: string | null };

type FilaMed = DatosPersonaObs["medicamentos"][number] & { usuario_id: string };
type FilaInv = DatosPersonaObs["inventarios"][number] & { usuario_id: string };
type FilaToma = DatosPersonaObs["tomas"][number] & { usuario_id: string };
type FilaMedicion = DatosPersonaObs["mediciones"][number] & { usuario_id: string };
type FilaMonitoreo = DatosPersonaObs["monitoreos"][number] & { usuario_id: string };
type FilaEstudio = DatosPersonaObs["estudios"][number] & { usuario_id: string };
type FilaTurno = DatosPersonaObs["turnos"][number] & { usuario_id: string };

/** Las lecturas de un lote (una consulta por tabla para todas las personas). Lanza ante un error real. */
async function cargarLote(admin: Cliente, personas: Persona[], hoy: string, ahora: Date): Promise<{ datos: DatosPersonaObs[]; cuidadoresPorPersona: Map<string, string[]> }> {
  const ids = personas.map((p) => p.id);
  const desdeTomas = sumarDias(hoy, -8);
  const desdeMediciones = new Date(ahora.getTime() - 9 * DIA_MS).toISOString();
  const desdeEstudios = new Date(ahora.getTime() - 15 * DIA_MS).toISOString();
  const hastaTurnos = sumarDias(hoy, 3);

  const [meds, invs, tomas, mediciones, monitoreos, estudios, turnos, vinculos] = await Promise.all([
    leerConFallback<FilaMed>(
      (d, h) =>
        admin
          .from("medicamentos")
          .select("id, usuario_id, nombre, forma, momento_dia, hora_programada, dias_recurrentes, cantidad_por_toma, inventario_id, fecha_fin, created_at")
          .in("usuario_id", ids)
          .order("id")
          .range(d, h),
      (d, h) =>
        admin
          .from("medicamentos")
          .select("id, usuario_id, nombre, momento_dia, hora_programada, dias_recurrentes, inventario_id, created_at")
          .in("usuario_id", ids)
          .order("id")
          .range(d, h),
      "los medicamentos"
    ),
    leerConFallback<FilaInv>(
      (d, h) => admin.from("inventario_pastillas").select("id, usuario_id, nombre, stock, pastillas_por_toma").in("usuario_id", ids).order("id").range(d, h),
      null,
      "el stock"
    ),
    leerConFallback<FilaToma>(
      (d, h) =>
        admin
          .from("medicamentos_tomas")
          .select("medicamento_id, usuario_id, fecha, tomado, omitida_at")
          .in("usuario_id", ids)
          .gte("fecha", desdeTomas)
          .order("id")
          .range(d, h),
      (d, h) =>
        admin.from("medicamentos_tomas").select("medicamento_id, usuario_id, fecha, tomado").in("usuario_id", ids).gte("fecha", desdeTomas).order("id").range(d, h),
      "las tomas"
    ),
    leerConFallback<FilaMedicion>(
      (d, h) =>
        admin
          .from("mediciones")
          .select("usuario_id, tipo, nombre_otra, valor, valor_secundario, medido_at")
          .in("usuario_id", ids)
          .gte("medido_at", desdeMediciones)
          .order("id")
          .range(d, h),
      (d, h) =>
        admin.from("mediciones").select("usuario_id, tipo, valor, valor_secundario, medido_at").in("usuario_id", ids).gte("medido_at", desdeMediciones).order("id").range(d, h),
      "las mediciones"
    ),
    leerConFallback<FilaMonitoreo>(
      (d, h) => admin.from("monitoreos").select("id, usuario_id, tipo, nombre_otra, fecha_fin, created_at").in("usuario_id", ids).order("id").range(d, h),
      null,
      "los monitoreos"
    ),
    leerConFallback<FilaEstudio>(
      (d, h) =>
        admin
          .from("estudios")
          .select("id, usuario_id, tipo, created_at, valores")
          .in("usuario_id", ids)
          .eq("estado", "listo")
          .gte("created_at", desdeEstudios)
          .order("id")
          .range(d, h),
      null,
      "los estudios"
    ),
    leerConFallback<FilaTurno>(
      (d, h) =>
        admin
          .from("turnos")
          .select("id, usuario_id, especialidad, fecha, hora, llevar")
          .in("usuario_id", ids)
          .gte("fecha", hoy)
          .lte("fecha", hastaTurnos)
          .order("id")
          .range(d, h),
      (d, h) =>
        admin.from("turnos").select("id, usuario_id, especialidad, fecha, hora").in("usuario_id", ids).gte("fecha", hoy).lte("fecha", hastaTurnos).order("id").range(d, h),
      "los turnos"
    ),
    leerConFallback<{ elder_id: string; cuidador_id: string | null; rol: string | null }>(
      (d, h) => admin.from("vinculos_cuidador").select("elder_id, cuidador_id, rol").eq("estado", "aceptado").in("elder_id", ids).order("id").range(d, h),
      null,
      "los vínculos"
    ),
  ]);

  const porMed = agrupar(meds);
  const porInv = agrupar(invs);
  const porToma = agrupar(tomas);
  const porMedicion = agrupar(mediciones);
  const porMonitoreo = agrupar(monitoreos);
  const porEstudio = agrupar(estudios);
  const porTurno = agrupar(turnos);

  const cuidadoresPorPersona = new Map<string, string[]>();
  for (const v of vinculos) {
    if (!v.cuidador_id || v.rol === "ver") continue; // rol null (filas viejas) cuenta como 'editar', como en el resto de la app
    cuidadoresPorPersona.set(v.elder_id, [...(cuidadoresPorPersona.get(v.elder_id) ?? []), v.cuidador_id]);
  }

  const horaAR = horaEnAR(ahora);
  const datos = personas.map<DatosPersonaObs>((p) => ({
    personaId: p.id,
    hoy,
    hora: horaAR,
    nombre: p.nombre ?? "",
    medicamentos: (porMed.get(p.id) ?? []).map((m) => ({ ...m, forma: m.forma ?? null, cantidad_por_toma: m.cantidad_por_toma ?? null, fecha_fin: m.fecha_fin ?? null })),
    inventarios: porInv.get(p.id) ?? [],
    tomas: (porToma.get(p.id) ?? []).map((t) => ({ ...t, omitida_at: t.omitida_at ?? null })),
    mediciones: (porMedicion.get(p.id) ?? []).map((m) => ({ ...m, nombre_otra: m.nombre_otra ?? null })),
    monitoreos: (porMonitoreo.get(p.id) ?? []).map((m) => ({ ...m, nombre_otra: m.nombre_otra ?? null })),
    estudios: (porEstudio.get(p.id) ?? []).map((e) => ({ ...e, valores: Array.isArray(e.valores) ? e.valores : [] })),
    turnos: (porTurno.get(p.id) ?? []).map((t) => ({ ...t, llevar: t.llevar ?? null })),
    cuidadoresEditores: (cuidadoresPorPersona.get(p.id) ?? []).length,
  }));
  return { datos, cuidadoresPorPersona };
}

/** Guarda lo actual de cada persona y vence lo que ya no se cumple. Devuelve los conteos. */
async function guardarLote(admin: Cliente, datos: DatosPersonaObs[], ahora: Date): Promise<{ guardadas: number; vencidas: number }> {
  const ids = datos.map((d) => d.personaId);
  const { data: existentes, error } = await admin
    .from("observaciones")
    .select("id, usuario_id, clave")
    .in("usuario_id", ids)
    .gt("vigente_hasta", ahora.toISOString());
  if (error) throw new Error(`No se pudieron leer las observaciones: ${error.message}`);
  const porPersona = agrupar((existentes ?? []) as { id: string; usuario_id: string; clave: string }[]);

  const filas: (ObservacionNueva & { usuario_id: string })[] = [];
  const aVencer: string[] = [];
  for (const d of datos) {
    const nuevas = evaluarReglas(d);
    const plan = planificarCambios(porPersona.get(d.personaId) ?? [], nuevas);
    for (const n of plan.aGuardar) filas.push({ ...n, usuario_id: d.personaId });
    aVencer.push(...plan.aVencer);
  }

  // Upsert (no ignoreDuplicates): refresca texto y números de una observación que sigue vigente y revive una que se
  // venció dentro de la misma semana. `vista_at`, `descartada_at` y `creada_at` no viajan, así que se conservan.
  if (filas.length > 0) {
    const { error: errorGuardar } = await admin.from("observaciones").upsert(filas, { onConflict: "usuario_id,clave" });
    if (errorGuardar) throw new Error(`No se pudieron guardar las observaciones: ${errorGuardar.message}`);
  }
  if (aVencer.length > 0) {
    const { error: errorVencer } = await admin.from("observaciones").update({ vigente_hasta: ahora.toISOString() }).in("id", aVencer);
    if (errorVencer) throw new Error(`No se pudieron vencer las observaciones: ${errorVencer.message}`);
  }
  return { guardadas: filas.length, vencidas: aVencer.length };
}

// --- Cursor -------------------------------------------------------------------------------------------------------

async function leerCursor(admin: Cliente, hoy: string): Promise<string> {
  const { data, error } = await admin
    .from("envios_avisos")
    .select("ref_id")
    .eq("tipo", TIPO_ENVIO_CURSOR)
    .eq("fecha", hoy)
    .order("ref_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return CURSOR_INICIAL;
  return (data as { ref_id: string }).ref_id;
}

/** Anota hasta dónde se llegó. `usuario_id` es el último procesado (la columna exige un usuario real). */
async function guardarCursor(admin: Cliente, hoy: string, ultimoId: string, fin: boolean): Promise<boolean> {
  const { error } = await admin
    .from("envios_avisos")
    .upsert(
      { tipo: TIPO_ENVIO_CURSOR, ref_id: fin ? CURSOR_FIN : ultimoId, fecha: hoy, usuario_id: ultimoId },
      { onConflict: "tipo,ref_id,fecha", ignoreDuplicates: true }
    );
  return !error;
}

// --- Push -------------------------------------------------------------------------------------------------------------

/**
 * Push de las observaciones nuevas más importantes: como máximo 1 por persona y por día (claim-before-send sobre
 * `envios_avisos`), solo de los tipos con push, y por el mismo camino que el resto de los avisos (fila en el feed +
 * push). Mira las observaciones creadas en las últimas 6 horas (la ventana del cron es de 3 h), así que si un tick
 * se quedó sin tiempo, el siguiente retoma lo que faltó.
 */
async function enviarPushPendientes(
  admin: Cliente,
  ahora: Date,
  hoy: string,
  hayTiempo: () => boolean
): Promise<number> {
  const desde = new Date(ahora.getTime() - 6 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("observaciones")
    .select("id, usuario_id, tipo, titulo, texto, href")
    .in("tipo", [...TIPOS_CON_PUSH])
    .eq("severidad", "atencion")
    .is("descartada_at", null)
    .gt("vigente_hasta", ahora.toISOString())
    .gte("creada_at", desde)
    .order("creada_at", { ascending: true })
    .limit(300);
  if (error || !data || data.length === 0) return 0;
  const candidatas = agrupar(data as (CandidataPush & { usuario_id: string })[]);
  const personaIds = [...candidatas.keys()];

  // Quienes ya recibieron su push de hoy.
  const { data: yaEnviados } = await admin
    .from("envios_avisos")
    .select("ref_id")
    .eq("tipo", TIPO_ENVIO_PUSH)
    .eq("fecha", hoy)
    .in("ref_id", personaIds);
  const hechos = new Set(((yaEnviados ?? []) as { ref_id: string }[]).map((r) => r.ref_id));
  const pendientes = personaIds.filter((id) => !hechos.has(id));
  if (pendientes.length === 0) return 0;

  const { data: vinculos } = await admin
    .from("vinculos_cuidador")
    .select("elder_id, cuidador_id, rol")
    .eq("estado", "aceptado")
    .in("elder_id", pendientes);
  const editores = new Map<string, string[]>();
  for (const v of (vinculos ?? []) as { elder_id: string; cuidador_id: string | null; rol: string | null }[]) {
    if (!v.cuidador_id || v.rol === "ver") continue;
    editores.set(v.elder_id, [...(editores.get(v.elder_id) ?? []), v.cuidador_id]);
  }
  const { data: perfiles } = await admin.from("perfiles").select("id, nombre").in("id", pendientes);
  const nombres = new Map(((perfiles ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre ?? ""]));
  const prefs = await obtenerPreferenciasDe(admin, [...new Set([...pendientes, ...[...editores.values()].flat()])]);
  const prefsDe = (id: string) => prefs.get(id) ?? PREFERENCIAS_POR_DEFECTO;
  const horaAR = horaEnAR(ahora);

  let enviados = 0;
  for (const personaId of pendientes) {
    if (!hayTiempo()) break;
    const elegida = elegirParaPush(candidatas.get(personaId) ?? []);
    if (!elegida) continue;
    const destinos = destinosDePush({ tipo: elegida.tipo, personaId, cuidadoresEditores: editores.get(personaId) ?? [], prefsDe, horaAR });
    if (destinos.length === 0) continue;
    if (!(await reclamarEnvio(admin, TIPO_ENVIO_PUSH, personaId, hoy, personaId))) continue;
    for (const destino of destinos) {
      const textos = textosDeAviso(elegida, destino.esPersona, nombres.get(personaId) ?? "");
      await entregarAviso(
        admin,
        destino.usuarioId,
        {
          tipo: "observacion",
          titulo: textos.titulo,
          cuerpo: textos.cuerpo,
          url: elegida.href,
          personaId: destino.esPersona ? null : personaId,
          datos: { observacion_id: elegida.id, observacion_tipo: elegida.tipo, persona_id: personaId },
        },
        payloadObservacion({ titulo: textos.titulo, cuerpo: textos.cuerpo, personaId, href: elegida.href })
      );
    }
    enviados++;
  }
  return enviados;
}

// --- Corrida ------------------------------------------------------------------------------------------------------------

export type ResumenObservaciones = {
  ok: boolean;
  /** true si la migración 062 todavía no está aplicada: el cron no hace nada. */
  saltado?: "sin_migracion";
  personas: number;
  /** Personas que fallaron incluso solas y se saltearon (el cursor avanzó igual). */
  omitidas: number;
  guardadas: number;
  vencidas: number;
  purgadas: number;
  push: number;
  /** true si ya se recorrió a todas las personas de hoy. */
  completo: boolean;
  error?: string;
};

/**
 * Un tick del cron: procesa lotes de personas mientras quede tiempo, después manda los push pendientes y purga lo
 * vencido hace más de 30 días. Nunca lanza: ante un error devuelve `ok: false` y el próximo tick reintenta.
 */
export async function procesarObservaciones(
  admin: Cliente,
  opciones: { presupuestoMs?: number; ahora?: Date; reloj?: () => number } = {}
): Promise<ResumenObservaciones> {
  const reloj = opciones.reloj ?? (() => performance.now());
  const inicio = reloj();
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_CRON_MS;
  const restante = () => presupuesto - (reloj() - inicio);
  const ahora = opciones.ahora ?? new Date();
  const hoy = fechaEnAR(ahora);
  const resumen: ResumenObservaciones = { ok: true, personas: 0, omitidas: 0, guardadas: 0, vencidas: 0, purgadas: 0, push: 0, completo: false };

  try {
    // ¿Existe la tabla? Sin la migración 062 todo queda en no-op.
    const sonda = await admin.from("observaciones").select("id").limit(1);
    if (sonda.error) {
      if (esErrorTablaInexistente(sonda.error)) return { ...resumen, saltado: "sin_migracion", completo: true };
      return { ...resumen, ok: false, error: sonda.error.message };
    }

    let cursor = await leerCursor(admin, hoy);
    let duracionLote = MINIMO_PARA_OTRO_LOTE_MS;
    while (cursor !== CURSOR_FIN) {
      // Se deja tiempo para los push y para un lote entero: si no alcanza, sigue el próximo tick.
      if (restante() < RESERVA_PUSH_MS + Math.max(MINIMO_PARA_OTRO_LOTE_MS, duracionLote * 1.5)) break;
      const t0 = reloj();
      const { data, error } = await admin
        .from("perfiles")
        .select("id, nombre")
        .not("onboarding_completado_at", "is", null)
        .gt("id", cursor)
        .order("id", { ascending: true })
        .limit(TAMANO_LOTE);
      if (error) throw new Error(`No se pudieron leer las personas: ${error.message}`);
      const personas = (data ?? []) as Persona[];
      if (personas.length === 0) {
        resumen.completo = await guardarCursor(admin, hoy, cursor === CURSOR_INICIAL ? await primerUsuario(admin) : cursor, true);
        break;
      }
      // Si el lote falla se reintenta persona por persona y solo se omite a la que falla (el cursor avanza igual).
      const { omitidos } = await procesarTolerante(
        personas,
        async (lote) => {
          const { datos } = await cargarLote(admin, lote, hoy, ahora);
          const r = await guardarLote(admin, datos, ahora);
          resumen.guardadas += r.guardadas;
          resumen.vencidas += r.vencidas;
        },
        (_persona, e) => {
          // Sin datos de la persona: solo el motivo, acotado.
          console.warn("observaciones: se omitió una persona por un error", e instanceof Error ? e.message.slice(0, 160) : "error desconocido");
        }
      );
      resumen.personas += personas.length - omitidos;
      resumen.omitidas += omitidos;
      const ultimo = personas[personas.length - 1].id;
      const fin = personas.length < TAMANO_LOTE;
      if (!(await guardarCursor(admin, hoy, ultimo, fin))) throw new Error("No se pudo anotar el avance del lote.");
      cursor = fin ? CURSOR_FIN : ultimo;
      resumen.completo = fin;
      duracionLote = reloj() - t0;
    }
    if (cursor === CURSOR_FIN) resumen.completo = true;

    resumen.push = await enviarPushPendientes(admin, ahora, hoy, () => restante() > 1_200);

    const purga = await admin.from("observaciones").delete().lt("vigente_hasta", corteDeRetencion(ahora.getTime())).select("id");
    if (!purga.error) resumen.purgadas = purga.data?.length ?? 0;
  } catch (e) {
    return { ...resumen, ok: false, error: e instanceof Error ? e.message : "Falló la corrida de observaciones." };
  }
  return resumen;
}

/** Un usuario cualquiera para anotar el cursor final cuando no hay personas (la columna exige un usuario real). */
async function primerUsuario(admin: Cliente): Promise<string> {
  const { data } = await admin.from("perfiles").select("id").limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? CURSOR_INICIAL;
}
