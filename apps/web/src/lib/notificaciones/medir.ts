import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { aMonitoreo } from "@/lib/mediciones/planes-nucleo";
import { esDeLaMetrica, fraseMedir, planAplica, tramosDeHoy, type Monitoreo } from "@/lib/mediciones/plan";
import { hrefNuevaMedicion, type Medicion } from "@/lib/mediciones/tipos";
import type { DiaSemana } from "@/lib/medicamentos/tipos";
import { entregarAviso, obtenerPreferenciasDe, reclamarEnvio } from "./avisos";
import { enSilencioNocturno, minutosDesde, PREFERENCIAS_POR_DEFECTO, type PreferenciasAvisos } from "./avisos-tipos";
import { payloadMedirPersona } from "./mensajes";
import { refDeterminista } from "./avisos-familia-reglas";

type FilaMedicion = Pick<Medicion, "usuario_id" | "tipo" | "nombre_otra" | "medido_at">;

/**
 * "Hora de medir…" a la hora de cada plan, salvo que ya se haya medido o sea
 * silencio nocturno; cada plan se apaga desde su detalle. Como con las dosis,
 * el aviso es de la persona. Si no tiene avisos activos en ningún celular
 * (perfil a cargo sin conectar), también va a sus cuidadores Admin: un Lector
 * no puede cargar el valor. Sin la migración 053 no hace nada.
 */
export async function procesarMonitoreos(
  admin: SupabaseClient,
  hoyAR: string,
  horaAR: string,
  diaHoy: DiaSemana
): Promise<number> {
  const { data, error } = await admin.from("monitoreos").select("*");
  if (error) return 0;

  const toca = (data ?? [])
    .map(aMonitoreo)
    .filter((p): p is Monitoreo => p !== null && planAplica(p, diaHoy, hoyAR))
    .flatMap((plan) =>
      plan.horarios
        .filter((h) => {
          const t = minutosDesde(h.hora, horaAR);
          return t >= 0 && t <= 5;
        })
        .map((h) => ({ plan, hora: h.hora }))
    );
  if (toca.length === 0) return 0;

  const usuarios = [...new Set(toca.map((c) => c.plan.usuario_id))];
  const [prefs, mediciones, cuidadores] = await Promise.all([
    obtenerPreferenciasDe(admin, usuarios),
    admin.from("mediciones").select("usuario_id, tipo, nombre_otra, medido_at").in("usuario_id", usuarios).gte("medido_at", `${hoyAR}T00:00:00-03:00`),
    cuidadoresSinAvisoPropio(admin, usuarios),
  ]);
  // Sin saber qué se midió no se avisa: un recordatorio de más también molesta.
  if (mediciones.error) return 0;
  const filas = (mediciones.data ?? []) as FilaMedicion[];

  let enviados = 0;
  for (const { plan, hora } of toca) {
    if (enSilencioNocturno(prefs.get(plan.usuario_id) ?? PREFERENCIAS_POR_DEFECTO, horaAR)) continue;
    const deHoy = filas.filter((m) => m.usuario_id === plan.usuario_id && esDeLaMetrica(m, plan));
    if (tramosDeHoy(plan.horarios, deHoy).find((t) => t.hora === hora)?.medicion) continue;
    if (!(await reclamarEnvio(admin, "medicion_hora", refDeterminista(plan.id, hora), hoyAR, plan.usuario_id))) continue;

    const que = fraseMedir(plan);
    const titulo = `Hora de medir ${que}`;
    const cuerpo = "Tocá para cargar el valor.";
    const url = hrefNuevaMedicion({ tipo: plan.tipo, nombre: plan.nombre_otra, unidad: plan.unidad_otra, hora, volver: "/app/avisos" });
    await entregarAviso(
      admin,
      plan.usuario_id,
      { tipo: "medicion", titulo, cuerpo, url, datos: { monitoreoId: plan.id } },
      { title: titulo, body: cuerpo, url, tag: `medir-${plan.id}-${hora}`, renotify: true, datos: { monitoreoId: plan.id } }
    );
    enviados++;

    const destino = cuidadores.get(plan.usuario_id);
    if (!destino) continue;
    for (const cuidadorId of destino.cuidadores) {
      if (enSilencioNocturno(destino.prefs.get(cuidadorId) ?? PREFERENCIAS_POR_DEFECTO, horaAR)) continue;
      if (!(await reclamarEnvio(admin, "medicion_persona", refDeterminista(plan.id, hora, cuidadorId), hoyAR, cuidadorId))) continue;
      const aviso = payloadMedirPersona({
        personaId: plan.usuario_id,
        personaNombre: destino.nombre,
        monitoreoId: plan.id,
        que,
        hora,
        relacion: destino.relacionDe.get(cuidadorId),
      });
      await entregarAviso(
        admin,
        cuidadorId,
        { tipo: "medicion_persona", titulo: aviso.title, cuerpo: aviso.body, url: aviso.url, personaId: plan.usuario_id, datos: { monitoreoId: plan.id } },
        aviso
      );
      enviados++;
    }
  }
  return enviados;
}

/**
 * Venció un "Posponer N minutos" de "Es hora de medirte…" (modo simple, 061) y
 * todavía no se anotó: "Hora de medir…" otra vez, a la persona. Una vez por
 * posposición (dedupe por su id), solo dentro de los 45 min de vencida y fuera
 * del silencio nocturno. Sin la migración 061 no hace nada.
 */
export async function procesarMedicionesPospuestas(admin: SupabaseClient, hoyAR: string, horaAR: string, ahora: Date = new Date()): Promise<number> {
  const desde = new Date(ahora.getTime() - 45 * 60_000).toISOString();
  const { data, error } = await admin
    .from("posposiciones_medicion")
    .select("id, monitoreo_id, usuario_id, hora, hasta")
    .eq("fecha", hoyAR)
    .lte("hasta", ahora.toISOString())
    .gt("hasta", desde);
  if (error || !data || data.length === 0) return 0;
  const pos = data as { id: string; monitoreo_id: string; usuario_id: string; hora: string; hasta: string }[];

  const usuarios = [...new Set(pos.map((p) => p.usuario_id))];
  const [planesRes, prefs, mediciones] = await Promise.all([
    admin.from("monitoreos").select("*").in("id", [...new Set(pos.map((p) => p.monitoreo_id))]),
    obtenerPreferenciasDe(admin, usuarios),
    admin.from("mediciones").select("usuario_id, tipo, nombre_otra, medido_at").in("usuario_id", usuarios).gte("medido_at", `${hoyAR}T00:00:00-03:00`),
  ]);
  if (planesRes.error || mediciones.error) return 0;
  const planes = new Map(
    (planesRes.data ?? []).map(aMonitoreo).filter((p): p is Monitoreo => p !== null).map((p) => [p.id, p])
  );
  const filas = (mediciones.data ?? []) as FilaMedicion[];

  let enviados = 0;
  for (const p of pos) {
    const plan = planes.get(p.monitoreo_id);
    if (!plan || plan.usuario_id !== p.usuario_id) continue;
    if (enSilencioNocturno(prefs.get(p.usuario_id) ?? PREFERENCIAS_POR_DEFECTO, horaAR)) continue;
    const deHoy = filas.filter((m) => m.usuario_id === p.usuario_id && esDeLaMetrica(m, plan));
    if (tramosDeHoy(plan.horarios, deHoy).find((t) => t.hora === p.hora)?.medicion) continue;
    if (!(await reclamarEnvio(admin, "medicion_pospuesta", p.id, hoyAR, p.usuario_id))) continue;
    const titulo = `Hora de medir ${fraseMedir(plan)}`;
    const cuerpo = "Te lo recuerdo como me pediste.";
    const url = hrefNuevaMedicion({ tipo: plan.tipo, nombre: plan.nombre_otra, unidad: plan.unidad_otra, hora: p.hora, volver: "/app/avisos" });
    await entregarAviso(
      admin,
      p.usuario_id,
      { tipo: "medicion", titulo, cuerpo, url, datos: { monitoreoId: plan.id } },
      { title: titulo, body: cuerpo, url, tag: `medir-${plan.id}-${p.hora}`, renotify: true, datos: { monitoreoId: plan.id } }
    );
    enviados++;
  }
  return enviados;
}

/**
 * Para el resumen de las 21 h: horarios de hoy de cada plan que ya pasaron y no
 * se anotaron ("la presión de las 9:00"). Si algo falla, mapa vacío: el resumen
 * sale igual, sin esa parte.
 */
export async function medicionesNoAnotadasHoy(
  admin: SupabaseClient,
  personaIds: string[],
  hoyAR: string,
  horaAR: string,
  diaHoy: DiaSemana
): Promise<Map<string, { que: string; hora: string }[]>> {
  const salida = new Map<string, { que: string; hora: string }[]>();
  if (personaIds.length === 0) return salida;
  const [planesRes, mediciones] = await Promise.all([
    admin.from("monitoreos").select("*").in("usuario_id", personaIds),
    admin.from("mediciones").select("usuario_id, tipo, nombre_otra, medido_at").in("usuario_id", personaIds).gte("medido_at", `${hoyAR}T00:00:00-03:00`),
  ]);
  if (planesRes.error || mediciones.error) return salida;
  const filas = (mediciones.data ?? []) as FilaMedicion[];
  const planes = (planesRes.data ?? []).map(aMonitoreo).filter((p): p is Monitoreo => p !== null && planAplica(p, diaHoy, hoyAR));
  for (const plan of planes) {
    const deHoy = filas.filter((m) => m.usuario_id === plan.usuario_id && esDeLaMetrica(m, plan));
    const faltan = tramosDeHoy(plan.horarios, deHoy).filter((t) => !t.medicion && t.hora < horaAR);
    if (faltan.length === 0) continue;
    const l = salida.get(plan.usuario_id) ?? [];
    l.push(...faltan.map((t) => ({ que: fraseMedir(plan), hora: t.hora })));
    salida.set(plan.usuario_id, l.sort((a, b) => a.hora.localeCompare(b.hora)));
  }
  return salida;
}

type DestinoFamilia = { nombre: string; cuidadores: string[]; prefs: Map<string, PreferenciasAvisos>; relacionDe: Map<string, string | null> };

/** Personas sin ningún celular con avisos, con sus cuidadores Admin. Si algo falla, nadie: no se avisa de más. */
async function cuidadoresSinAvisoPropio(admin: SupabaseClient, usuarios: string[]): Promise<Map<string, DestinoFamilia>> {
  const salida = new Map<string, DestinoFamilia>();
  const subs = await admin.from("push_suscripciones").select("usuario_id").in("usuario_id", usuarios);
  if (subs.error) return salida;
  const conAvisos = new Set((subs.data ?? []).map((s) => s.usuario_id as string));
  const sinAvisos = usuarios.filter((u) => !conAvisos.has(u));
  if (sinAvisos.length === 0) return salida;

  const [vinculos, perfiles] = await Promise.all([
    admin.from("vinculos_cuidador").select("elder_id, cuidador_id, relacion").eq("estado", "aceptado").eq("rol", "editar").in("elder_id", sinAvisos),
    admin.from("perfiles").select("id, nombre").in("id", sinAvisos),
  ]);
  if (vinculos.error) return salida;
  const filas = (vinculos.data ?? []) as { elder_id: string; cuidador_id: string | null; relacion?: string | null }[];
  const prefs = await obtenerPreferenciasDe(admin, [...new Set(filas.flatMap((v) => (v.cuidador_id ? [v.cuidador_id] : [])))]);
  const nombres = new Map(((perfiles.data ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre?.trim() || "Tu familiar"]));
  for (const v of filas) {
    if (!v.cuidador_id) continue;
    const d = salida.get(v.elder_id) ?? { nombre: nombres.get(v.elder_id) ?? "Tu familiar", cuidadores: [], prefs, relacionDe: new Map<string, string | null>() };
    d.cuidadores.push(v.cuidador_id);
    d.relacionDe.set(v.cuidador_id, v.relacion ?? null);
    salida.set(v.elder_id, d);
  }
  return salida;
}
