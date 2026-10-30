import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { diaSemanaDe, fechaEnAR, horaEnAR } from "@/lib/medicamentos/nucleo";
import type { DiaSemana } from "@/lib/medicamentos/tipos";
import { esStockBajo } from "@/lib/inventario/tipos";
import {
  PREFERENCIAS_POR_DEFECTO,
  enSilencioNocturno,
  minutosDesde,
  type PreferenciasAvisos,
} from "./avisos-tipos";
import { entregarAviso, existeEnvio, familiaAvisosDisponible, obtenerPreferenciasDe, reclamarEnvio } from "./avisos";
import {
  cuidadorRecibe,
  enVentanaResumenDia,
  enVentanaStockPersona,
  enVentanaTurnoPersona,
  refDeterminista,
  type RolCuidador,
} from "./avisos-familia-reglas";
import {
  horaCorta,
  payloadResumenDia,
  payloadStockPersona,
  payloadTurnoAcompanadoDiaAntes,
  payloadTurnoPersonaDiaAntes,
  payloadDosisHora,
  payloadDosisPospuesta,
  payloadDosisResuelta,
  payloadDosisSegundoAviso,
  payloadStockBajo,
  payloadTurno2h,
  payloadTurnoDiaAntes,
} from "./mensajes";

// Avisos programados (cron cada 5 min, mismo job `dosis-vencidas`). Cada aviso
// pasa por el dedupe claim-before-send de `envios_avisos` (unique tipo +
// ref_id + fecha AR) ANTES de enviar: con ticks superpuestos o ventanas que se
// pisan, sale como máximo uno por (aviso, dosis/turno/stock, día).
//
//   tipo               ventana (hora AR)                     ref_id
//   dosis_hora         0..5 min después de hora_programada   medicamento
//   dosis_segundo      30..60 min después, si hubo dosis_hora medicamento
//   dosis_pospuesta    hasta vencida (<45 min), sin tomar    posposición
//   turno_dia_antes    el día anterior 20:00-22:59           turno
//   turno_2h           105..120 min antes del turno          turno
//   stock_bajo         09:00-20:59, una vez por día          inventario
//
// Avisos de familia (al CUIDADOR, sobre la persona cuidada; migración 028 —
// sin ella quedan apagados, ver `procesarAvisosDeFamilia` y las reglas en
// avisos-familia-reglas.ts). Como son por cuidador, el ref_id del dedupe es un
// uuid determinista de (persona, cuidador[, turno/inventario]):
//   resumen_dia_persona       21:00-21:59                           persona x cuidador
//   turno_persona_dia_antes   20:00-22:59 del día anterior          turno x cuidador
//   stock_bajo_persona        09:00-20:59, a cuidadores Admin       inventario x cuidador
//
// Silencio nocturno: aplica a dosis_hora, dosis_pospuesta, turnos y stock. NO
// aplica al segundo aviso (la toma sin confirmar suena igual, como en el
// diseño) — y como solo existe si el primero salió, nunca es el primer ruido
// de la noche. El aviso al cuidador (alerta de dosis vencida) tampoco lo
// respeta; ese flujo vive en la route.

type Cliente = SupabaseClient;

export type ResumenProgramados = {
  dosisHora: number;
  dosisSegundo: number;
  dosisPospuesta: number;
  turnoDiaAntes: number;
  turno2h: number;
  stockBajo: number;
  dosisResuelta: number;
  resumenDia: number;
  turnoPersona: number;
  stockPersona: number;
  /** Solo si falló la parte de familia (el resto del tick no se ve afectado). */
  errorFamilia?: string;
};

type FilaMedicamento = {
  id: string;
  usuario_id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  hora_programada: string;
  dias_recurrentes: DiaSemana[] | null;
  con_comida: string | null;
  notas: string | null;
};

type FilaPosposicion = { id: string; medicamento_id: string; usuario_id: string; fecha: string; hasta: string };

const MAX_MIN_DESDE_POSPUESTA = 45;

/**
 * Dosis (de las `medicamentoIds`) que el usuario ya confirmó HOY según el
 * calendario AR (`medicamentos_tomas.fecha` ya es la fecha AR de la dosis).
 */
async function tomadasHoyAR(admin: Cliente, medicamentoIds: string[], hoyAR: string): Promise<Set<string>> {
  const tomadas = new Set<string>();
  if (medicamentoIds.length === 0) return tomadas;
  const { data, error } = await admin
    .from("medicamentos_tomas")
    .select("medicamento_id")
    .eq("tomado", true)
    .eq("fecha", hoyAR)
    .in("medicamento_id", medicamentoIds);
  if (error) throw new Error(`No se pudieron leer las tomas: ${error.message}`);
  for (const t of (data ?? []) as { medicamento_id: string }[]) tomadas.add(t.medicamento_id);
  return tomadas;
}

function aplicaHoy(m: FilaMedicamento, dia: DiaSemana): boolean {
  const dias = m.dias_recurrentes ?? [];
  return dias.length === 0 || dias.includes(dia);
}

function conDatosDosis(m: FilaMedicamento, fechaAR: string) {
  return {
    medicamentoId: m.id,
    nombre: m.nombre,
    dosis: m.dosis,
    unidad: m.unidad,
    conComida: m.con_comida,
    notas: m.notas,
    horaProgramada: m.hora_programada,
    fechaAR,
  };
}

const TURNO_HORA = /^\d{1,2}:\d{2}$/;

export async function procesarAvisosProgramados(admin: Cliente, ahora: Date = new Date()): Promise<ResumenProgramados> {
  const resumen: ResumenProgramados = {
    dosisHora: 0,
    dosisSegundo: 0,
    dosisPospuesta: 0,
    turnoDiaAntes: 0,
    turno2h: 0,
    stockBajo: 0,
    dosisResuelta: 0,
    resumenDia: 0,
    turnoPersona: 0,
    stockPersona: 0,
  };

  const hoyAR = fechaEnAR(ahora);
  const horaAR = horaEnAR(ahora);
  const diaHoy = diaSemanaDe(ahora);
  const mananaAR = fechaEnAR(new Date(ahora.getTime() + 24 * 60 * 60 * 1000));

  // Higiene: los claims de más de una semana ya no sirven para deduplicar.
  const corte = fechaEnAR(new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000));
  await admin.from("envios_avisos").delete().lt("fecha", corte);

  const { data: medsData, error: errorMeds } = await admin
    .from("medicamentos")
    .select("id, usuario_id, nombre, dosis, unidad, hora_programada, dias_recurrentes, con_comida, notas");
  if (errorMeds) throw new Error(`No se pudieron leer los medicamentos: ${errorMeds.message}`);
  const medicamentos = (medsData ?? []) as FilaMedicamento[];
  const medPorId = new Map(medicamentos.map((m) => [m.id, m]));
  const deHoy = medicamentos.filter((m) => aplicaHoy(m, diaHoy));

  const { data: posData } = await admin.from("posposiciones").select("id, medicamento_id, usuario_id, fecha, hasta").eq("fecha", hoyAR);
  const posposiciones = (posData ?? []) as FilaPosposicion[];
  const posPorMed = new Map<string, FilaPosposicion[]>();
  for (const p of posposiciones) {
    const lista = posPorMed.get(p.medicamento_id) ?? [];
    lista.push(p);
    posPorMed.set(p.medicamento_id, lista);
  }
  const ahoraMs = ahora.getTime();
  const posActiva = (medId: string) => (posPorMed.get(medId) ?? []).some((p) => new Date(p.hasta).getTime() > ahoraMs);

  // Candidatos de dosis de este tick.
  const candHora = deHoy.filter((m) => {
    const t = minutosDesde(m.hora_programada, horaAR);
    return t >= 0 && t <= 5;
  });
  const candSegundo = deHoy.filter((m) => {
    const t = minutosDesde(m.hora_programada, horaAR);
    return t >= 30 && t <= 60;
  });
  const candPospuesta = posposiciones.filter((p) => {
    const vencidaHace = (ahoraMs - new Date(p.hasta).getTime()) / 60_000;
    if (vencidaHace < 0 || vencidaHace > MAX_MIN_DESDE_POSPUESTA) return false;
    // Solo la última posposición de la dosis cuenta.
    const mayor = Math.max(...(posPorMed.get(p.medicamento_id) ?? []).map((x) => new Date(x.hasta).getTime()));
    return new Date(p.hasta).getTime() === mayor && medPorId.has(p.medicamento_id);
  });

  // Alertas al cuidador de hoy todavía sin "ya tomó".
  const { data: alertasData } = await admin
    .from("alertas_dosis")
    .select("id, medicamento_id, fecha")
    .eq("fecha", hoyAR)
    .eq("estado", "enviado")
    .is("resuelta_at", null);
  const alertasAbiertas = (alertasData ?? []) as { id: string; medicamento_id: string; fecha: string }[];

  const idsAConsultar = [
    ...new Set([
      ...candHora.map((m) => m.id),
      ...candSegundo.map((m) => m.id),
      ...candPospuesta.map((p) => p.medicamento_id),
      ...alertasAbiertas.map((a) => a.medicamento_id),
    ]),
  ];
  const tomadas = await tomadasHoyAR(admin, idsAConsultar, hoyAR);

  // Turnos de hoy y mañana + stock.
  const { data: turnosData } = await admin
    .from("turnos")
    .select("id, usuario_id, especialidad, profesional, lugar, fecha, hora, acompanado")
    .in("fecha", [hoyAR, mananaAR]);
  const turnos = (turnosData ?? []) as {
    id: string;
    usuario_id: string;
    especialidad: string;
    profesional: string | null;
    lugar: string | null;
    fecha: string;
    hora: string;
    acompanado: boolean | null;
  }[];

  const { data: invData } = await admin.from("inventario_pastillas").select("id, usuario_id, nombre, stock, umbral_alerta");
  const stockBajo = ((invData ?? []) as { id: string; usuario_id: string; nombre: string; stock: number; umbral_alerta: number }[]).filter(
    (i) => esStockBajo(i.stock, i.umbral_alerta)
  );

  // Preferencias de todos los usuarios involucrados (una sola lectura).
  const usuarios = new Set<string>();
  candHora.forEach((m) => usuarios.add(m.usuario_id));
  candSegundo.forEach((m) => usuarios.add(m.usuario_id));
  candPospuesta.forEach((p) => usuarios.add(p.usuario_id));
  turnos.forEach((t) => usuarios.add(t.usuario_id));
  stockBajo.forEach((i) => usuarios.add(i.usuario_id));
  const prefsMapa = await obtenerPreferenciasDe(admin, [...usuarios]);
  const prefsDe = (id: string): PreferenciasAvisos => prefsMapa.get(id) ?? PREFERENCIAS_POR_DEFECTO;
  const silenciado = (id: string) => enSilencioNocturno(prefsDe(id), horaAR);

  // a) A la hora de la toma.
  for (const m of candHora) {
    const prefs = prefsDe(m.usuario_id);
    if (!prefs.recordatorio_dosis || silenciado(m.usuario_id) || tomadas.has(m.id) || posActiva(m.id)) continue;
    if (!(await reclamarEnvio(admin, "dosis_hora", m.id, hoyAR, m.usuario_id))) continue;
    const payload = payloadDosisHora(conDatosDosis(m, hoyAR));
    await entregarAviso(
      admin,
      m.usuario_id,
      { tipo: "dosis", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: { medicamentoId: m.id } },
      payload
    );
    resumen.dosisHora++;
  }

  // b) Segundo aviso: sigue sin tomarse y no hay una posposición en juego.
  for (const m of candSegundo) {
    const prefs = prefsDe(m.usuario_id);
    if (!prefs.recordatorio_dosis || tomadas.has(m.id) || (posPorMed.get(m.id) ?? []).length > 0) continue;
    // Solo tiene sentido si el primero llegó a salir (si estaba silenciado no hay "todavía no").
    if (!(await existeEnvio(admin, "dosis_hora", m.id, hoyAR))) continue;
    if (!(await reclamarEnvio(admin, "dosis_segundo", m.id, hoyAR, m.usuario_id))) continue;
    const payload = payloadDosisSegundoAviso(conDatosDosis(m, hoyAR));
    await entregarAviso(
      admin,
      m.usuario_id,
      { tipo: "dosis_segundo", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: { medicamentoId: m.id, tono: "ambar" } },
      payload
    );
    resumen.dosisSegundo++;
  }

  // d) Venció una posposición y la dosis sigue pendiente.
  for (const p of candPospuesta) {
    const m = medPorId.get(p.medicamento_id);
    if (!m) continue;
    const prefs = prefsDe(p.usuario_id);
    if (!prefs.recordatorio_dosis || silenciado(p.usuario_id) || tomadas.has(m.id)) continue;
    if (!(await reclamarEnvio(admin, "dosis_pospuesta", p.id, hoyAR, p.usuario_id))) continue;
    const payload = payloadDosisPospuesta(conDatosDosis(m, hoyAR));
    await entregarAviso(
      admin,
      p.usuario_id,
      { tipo: "dosis_pospuesta", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: { medicamentoId: m.id } },
      payload
    );
    resumen.dosisPospuesta++;
  }

  // e) Turnos: el día anterior a las 20:00 y 2 h antes.
  for (const t of turnos) {
    const prefs = prefsDe(t.usuario_id);
    if (!prefs.aviso_turnos || silenciado(t.usuario_id) || !TURNO_HORA.test(t.hora)) continue;
    const datosTurno = { turnoId: t.id, especialidad: t.especialidad, profesional: t.profesional, lugar: t.lugar, hora: t.hora };

    if (t.fecha === mananaAR && horaAR >= "20:00" && horaAR < "23:00") {
      if (await reclamarEnvio(admin, "turno_dia_antes", t.id, t.fecha, t.usuario_id)) {
        const payload = payloadTurnoDiaAntes(datosTurno);
        await entregarAviso(
          admin,
          t.usuario_id,
          { tipo: "turno_dia_antes", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: payload.datos },
          payload
        );
        resumen.turnoDiaAntes++;
      }
    }

    if (t.fecha === hoyAR) {
      const [hh, mm] = t.hora.split(":");
      const instante = new Date(`${t.fecha}T${hh.padStart(2, "0")}:${mm}:00-03:00`); // AR no tiene horario de verano
      const faltan = (instante.getTime() - ahoraMs) / 60_000;
      if (faltan > 105 && faltan <= 120 && (await reclamarEnvio(admin, "turno_2h", t.id, t.fecha, t.usuario_id))) {
        const payload = payloadTurno2h(datosTurno);
        await entregarAviso(
          admin,
          t.usuario_id,
          { tipo: "turno_2h", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: payload.datos },
          payload
        );
        resumen.turno2h++;
      }
    }
  }

  // f) Stock bajo: una vez por día por medicamento, en horario diurno.
  if (horaAR >= "09:00" && horaAR < "21:00") {
    for (const i of stockBajo) {
      const prefs = prefsDe(i.usuario_id);
      if (!prefs.stock_bajo || silenciado(i.usuario_id)) continue;
      if (!(await reclamarEnvio(admin, "stock_bajo", i.id, hoyAR, i.usuario_id))) continue;
      const payload = payloadStockBajo({ inventarioId: i.id, nombre: i.nombre, stock: i.stock, fechaAR: hoyAR });
      await entregarAviso(
        admin,
        i.usuario_id,
        { tipo: "stock_bajo", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: { inventarioId: i.id } },
        payload
      );
      resumen.stockBajo++;
    }
  }

  // g) "Ya tomó": el elder confirmó después de la alerta al cuidador. Mismo tag
  // que la alerta, así reemplaza la notificación en vez de sumar otra.
  for (const a of alertasAbiertas) {
    const m = medPorId.get(a.medicamento_id);
    if (!m || !tomadas.has(m.id)) continue;
    const { data: reclamada } = await admin
      .from("alertas_dosis")
      .update({ resuelta_at: ahora.toISOString() })
      .eq("id", a.id)
      .is("resuelta_at", null)
      .select("id")
      .maybeSingle();
    if (!reclamada) continue;

    const { data: vinculos } = await admin
      .from("vinculos_cuidador")
      .select("cuidador_id")
      .eq("estado", "aceptado")
      .eq("elder_id", m.usuario_id);
    const todos = ((vinculos ?? []) as { cuidador_id: string | null }[])
      .map((v) => v.cuidador_id)
      .filter((id): id is string => Boolean(id));
    // Quien apagó "Si no confirma una toma" tampoco recibe el "ya tomó".
    const prefsCuidadores = await obtenerPreferenciasDe(admin, todos);
    const cuidadorIds = todos.filter((id) => (prefsCuidadores.get(id) ?? PREFERENCIAS_POR_DEFECTO).pendiente_persona);
    if (cuidadorIds.length === 0) continue;

    const { data: perfil } = await admin.from("perfiles").select("nombre").eq("id", m.usuario_id).maybeSingle();
    const elderNombre = (perfil as { nombre: string | null } | null)?.nombre?.trim().split(/\s+/)[0] || "Tu familiar";
    const payload = payloadDosisResuelta({
      elderNombre,
      elderId: m.usuario_id,
      medicamentoId: m.id,
      nombre: m.nombre,
      fechaAR: a.fecha,
    });
    for (const cuidadorId of cuidadorIds) {
      await entregarAviso(
        admin,
        cuidadorId,
        { tipo: "dosis_resuelta_cuidador", titulo: payload.body, cuerpo: `Era a las ${horaCorta(m.hora_programada)}`, url: payload.url, personaId: m.usuario_id, datos: { elderId: m.usuario_id, medicamentoId: m.id } },
        payload
      );
    }
    resumen.dosisResuelta++;
  }

  // h) Avisos de familia. Un fallo acá no tumba lo que ya salió en este tick.
  if (enVentanaResumenDia(horaAR) || enVentanaTurnoPersona(horaAR) || enVentanaStockPersona(horaAR)) {
    try {
      if (await familiaAvisosDisponible(admin)) {
        await procesarAvisosDeFamilia(admin, {
          ahora,
          hoyAR,
          horaAR,
          mananaAR,
          deHoy,
          turnos,
          stockBajo,
          resumen,
        });
      }
    } catch (e) {
      resumen.errorFamilia = e instanceof Error ? e.message : "Fallo en los avisos de familia.";
    }
  }

  return resumen;
}

type ContextoFamilia = {
  ahora: Date;
  hoyAR: string;
  horaAR: string;
  mananaAR: string;
  deHoy: FilaMedicamento[];
  turnos: { id: string; usuario_id: string; especialidad: string; profesional: string | null; fecha: string; hora: string; acompanado: boolean | null }[];
  stockBajo: { id: string; usuario_id: string; nombre: string; stock: number }[];
  resumen: ResumenProgramados;
};

/**
 * Resumen del día, turno de mañana y stock bajo de las personas cuidadas, al
 * feed (y push) de cada cuidador. Todo pasa por reclamarEnvio antes de enviar.
 */
async function procesarAvisosDeFamilia(admin: Cliente, c: ContextoFamilia): Promise<void> {
  const { hoyAR, horaAR, mananaAR, resumen } = c;
  const hacerResumen = enVentanaResumenDia(horaAR);
  const hacerTurnos = enVentanaTurnoPersona(horaAR);
  const hacerStock = enVentanaStockPersona(horaAR);

  const medsDePersona = new Map<string, FilaMedicamento[]>();
  if (hacerResumen) {
    for (const m of c.deHoy) {
      const l = medsDePersona.get(m.usuario_id) ?? [];
      l.push(m);
      medsDePersona.set(m.usuario_id, l);
    }
  }
  const turnosManana = hacerTurnos ? c.turnos.filter((t) => t.fecha === mananaAR && TURNO_HORA.test(t.hora)) : [];
  const stock = hacerStock ? c.stockBajo : [];

  const personaIds = [...new Set([...medsDePersona.keys(), ...turnosManana.map((t) => t.usuario_id), ...stock.map((i) => i.usuario_id)])];
  if (personaIds.length === 0) return;

  const { data: vinculosData, error: errorVinculos } = await admin
    .from("vinculos_cuidador")
    .select("elder_id, cuidador_id, rol")
    .eq("estado", "aceptado")
    .in("elder_id", personaIds);
  if (errorVinculos) throw new Error(`No se pudieron leer los vínculos: ${errorVinculos.message}`);
  const cuidadoresDe = new Map<string, { cuidadorId: string; rol: RolCuidador }[]>();
  for (const v of (vinculosData ?? []) as { elder_id: string; cuidador_id: string | null; rol: string | null }[]) {
    if (!v.cuidador_id) continue;
    const l = cuidadoresDe.get(v.elder_id) ?? [];
    l.push({ cuidadorId: v.cuidador_id, rol: v.rol === "ver" ? "ver" : "editar" });
    cuidadoresDe.set(v.elder_id, l);
  }
  if (cuidadoresDe.size === 0) return;

  const cuidadorIds = [...new Set([...cuidadoresDe.values()].flatMap((l) => l.map((x) => x.cuidadorId)))];
  const prefsMapa = await obtenerPreferenciasDe(admin, cuidadorIds);
  const prefsDe = (id: string): PreferenciasAvisos => prefsMapa.get(id) ?? PREFERENCIAS_POR_DEFECTO;

  const { data: perfiles } = await admin.from("perfiles").select("id, nombre").in("id", [...cuidadoresDe.keys()]);
  const nombreDe = new Map<string, string>();
  for (const p of (perfiles ?? []) as { id: string; nombre: string | null }[]) {
    nombreDe.set(p.id, p.nombre?.trim().split(/\s+/)[0] || "Tu familiar");
  }
  const nombre = (id: string) => nombreDe.get(id) ?? "Tu familiar";

  // Resumen del día: "Elsa tomó 4 de 5 hoy" con las tomas REALES de hoy (AR).
  if (hacerResumen) {
    const ids = [...medsDePersona.values()].flat().map((m) => m.id);
    const tomadas = await tomadasHoyAR(admin, ids, hoyAR);
    for (const [personaId, meds] of medsDePersona) {
      const cuidadores = cuidadoresDe.get(personaId);
      if (!cuidadores || meds.length === 0) continue;
      const hechas = meds.filter((m) => tomadas.has(m.id)).length;
      const pendientes = meds
        .filter((m) => !tomadas.has(m.id))
        .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada))
        .map((m) => ({ nombre: m.nombre, hora: m.hora_programada }));
      for (const cu of cuidadores) {
        const silenciado = enSilencioNocturno(prefsDe(cu.cuidadorId), horaAR);
        if (!cuidadorRecibe("resumen_dia_persona", prefsDe(cu.cuidadorId), cu.rol, silenciado)) continue;
        if (!(await reclamarEnvio(admin, "resumen_dia_persona", refDeterminista(personaId, cu.cuidadorId), hoyAR, cu.cuidadorId))) continue;
        const payload = payloadResumenDia({
          personaId,
          personaNombre: nombre(personaId),
          tomadas: hechas,
          total: meds.length,
          pendientes,
          fechaAR: hoyAR,
        });
        await entregarAviso(
          admin,
          cu.cuidadorId,
          {
            tipo: "resumen_dia_persona",
            titulo: payload.title,
            cuerpo: payload.body,
            url: payload.url,
            personaId,
            datos: { personaId, tomadas: hechas, total: meds.length, tono: pendientes.length > 0 ? "ambar" : "ok" },
          },
          payload
        );
        resumen.resumenDia++;
      }
    }
  }

  // Turno de la persona mañana.
  for (const t of turnosManana) {
    for (const cu of cuidadoresDe.get(t.usuario_id) ?? []) {
      const silenciado = enSilencioNocturno(prefsDe(cu.cuidadorId), horaAR);
      if (!cuidadorRecibe("turno_persona_dia_antes", prefsDe(cu.cuidadorId), cu.rol, silenciado)) continue;
      if (t.acompanado) {
        // Turno con "Voy a ir acompañado": reemplaza al aviso genérico (no llegan dos) y pide compañía.
        if (!(await reclamarEnvio(admin, "turno_acompanado_dia_antes", refDeterminista(t.usuario_id, cu.cuidadorId, t.id), t.fecha, cu.cuidadorId))) continue;
        const aviso = payloadTurnoAcompanadoDiaAntes({
          personaId: t.usuario_id,
          personaNombre: nombre(t.usuario_id),
          turnoId: t.id,
          especialidad: t.especialidad,
          hora: t.hora,
        });
        await entregarAviso(
          admin,
          cu.cuidadorId,
          { tipo: "turno_acompanado_dia_antes", titulo: aviso.title, cuerpo: aviso.body, url: aviso.url, personaId: t.usuario_id, datos: { turnoId: t.id } },
          aviso
        );
        resumen.turnoPersona++;
        continue;
      }
      if (!(await reclamarEnvio(admin, "turno_persona_dia_antes", refDeterminista(t.usuario_id, cu.cuidadorId, t.id), t.fecha, cu.cuidadorId))) continue;
      const payload = payloadTurnoPersonaDiaAntes({
        personaId: t.usuario_id,
        personaNombre: nombre(t.usuario_id),
        turnoId: t.id,
        especialidad: t.especialidad,
        profesional: t.profesional,
        hora: t.hora,
      });
      await entregarAviso(
        admin,
        cu.cuidadorId,
        { tipo: "turno_persona_dia_antes", titulo: payload.title, cuerpo: payload.body, url: payload.url, personaId: t.usuario_id, datos: { turnoId: t.id } },
        payload
      );
      resumen.turnoPersona++;
    }
  }

  // Stock bajo de la persona, a sus cuidadores Admin (una vez por día por inventario).
  for (const i of stock) {
    for (const cu of cuidadoresDe.get(i.usuario_id) ?? []) {
      const silenciado = enSilencioNocturno(prefsDe(cu.cuidadorId), horaAR);
      if (!cuidadorRecibe("stock_bajo_persona", prefsDe(cu.cuidadorId), cu.rol, silenciado)) continue;
      if (!(await reclamarEnvio(admin, "stock_bajo_persona", refDeterminista(i.usuario_id, cu.cuidadorId, i.id), hoyAR, cu.cuidadorId))) continue;
      const payload = payloadStockPersona({
        personaId: i.usuario_id,
        personaNombre: nombre(i.usuario_id),
        inventarioId: i.id,
        nombre: i.nombre,
        stock: i.stock,
        fechaAR: hoyAR,
      });
      await entregarAviso(
        admin,
        cu.cuidadorId,
        { tipo: "stock_bajo_persona", titulo: payload.title, cuerpo: payload.body, url: payload.url, personaId: i.usuario_id, datos: { inventarioId: i.id } },
        payload
      );
      resumen.stockPersona++;
    }
  }
}
