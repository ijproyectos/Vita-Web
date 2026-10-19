import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { diaSemanaDe, fechaEnAR, fechaEnUTC, horaEnAR } from "@/lib/medicamentos/nucleo";
import type { DiaSemana } from "@/lib/medicamentos/tipos";
import { esStockBajo } from "@/lib/inventario/tipos";
import {
  PREFERENCIAS_POR_DEFECTO,
  enSilencioNocturno,
  minutosDesde,
  type PreferenciasAvisos,
} from "./avisos-tipos";
import { entregarAviso, existeEnvio, obtenerPreferenciasDe, reclamarEnvio } from "./avisos";
import {
  horaCorta,
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
 * calendario AR. `medicamentos_tomas.fecha` es UTC, así que una toma de las
 * 22:00 de ayer puede tener fecha de "hoy" UTC: se compara la fecha AR de
 * `tomado_en`, no `fecha`, para no tomar por confirmada la dosis de la
 * mañana por una de anoche.
 */
async function tomadasHoyAR(admin: Cliente, medicamentoIds: string[], ahora: Date, hoyAR: string): Promise<Set<string>> {
  const tomadas = new Set<string>();
  if (medicamentoIds.length === 0) return tomadas;
  const hoyUTC = fechaEnUTC(ahora);
  const ayerUTC = fechaEnUTC(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
  const { data, error } = await admin
    .from("medicamentos_tomas")
    .select("medicamento_id, tomado_en")
    .eq("tomado", true)
    .in("fecha", [hoyUTC, ayerUTC])
    .in("medicamento_id", medicamentoIds);
  if (error) throw new Error(`No se pudieron leer las tomas: ${error.message}`);
  for (const t of (data ?? []) as { medicamento_id: string; tomado_en: string | null }[]) {
    if (!t.tomado_en || fechaEnAR(new Date(t.tomado_en)) === hoyAR) tomadas.add(t.medicamento_id);
  }
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
  const tomadas = await tomadasHoyAR(admin, idsAConsultar, ahora, hoyAR);

  // Turnos de hoy y mañana + stock.
  const { data: turnosData } = await admin
    .from("turnos")
    .select("id, usuario_id, especialidad, profesional, lugar, fecha, hora")
    .in("fecha", [hoyAR, mananaAR]);
  const turnos = (turnosData ?? []) as {
    id: string;
    usuario_id: string;
    especialidad: string;
    profesional: string | null;
    lugar: string | null;
    fecha: string;
    hora: string;
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
    const cuidadorIds = ((vinculos ?? []) as { cuidador_id: string | null }[])
      .map((v) => v.cuidador_id)
      .filter((id): id is string => Boolean(id));
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
        { tipo: "dosis_resuelta_cuidador", titulo: payload.body, cuerpo: `Era a las ${horaCorta(m.hora_programada)}`, url: payload.url },
        payload
      );
    }
    resumen.dosisResuelta++;
  }

  return resumen;
}
