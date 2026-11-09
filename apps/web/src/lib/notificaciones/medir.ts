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
    const url = hrefNuevaMedicion({ tipo: plan.tipo, nombre: plan.nombre_otra, unidad: plan.unidad_otra, volver: "/app/avisos" });
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
      const aviso = payloadMedirPersona({ personaId: plan.usuario_id, personaNombre: destino.nombre, monitoreoId: plan.id, que, hora });
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

type DestinoFamilia = { nombre: string; cuidadores: string[]; prefs: Map<string, PreferenciasAvisos> };

/** Personas sin ningún celular con avisos, con sus cuidadores Admin. Si algo falla, nadie: no se avisa de más. */
async function cuidadoresSinAvisoPropio(admin: SupabaseClient, usuarios: string[]): Promise<Map<string, DestinoFamilia>> {
  const salida = new Map<string, DestinoFamilia>();
  const subs = await admin.from("push_suscripciones").select("usuario_id").in("usuario_id", usuarios);
  if (subs.error) return salida;
  const conAvisos = new Set((subs.data ?? []).map((s) => s.usuario_id as string));
  const sinAvisos = usuarios.filter((u) => !conAvisos.has(u));
  if (sinAvisos.length === 0) return salida;

  const [vinculos, perfiles] = await Promise.all([
    admin.from("vinculos_cuidador").select("elder_id, cuidador_id").eq("estado", "aceptado").eq("rol", "editar").in("elder_id", sinAvisos),
    admin.from("perfiles").select("id, nombre").in("id", sinAvisos),
  ]);
  if (vinculos.error) return salida;
  const filas = (vinculos.data ?? []) as { elder_id: string; cuidador_id: string | null }[];
  const prefs = await obtenerPreferenciasDe(admin, [...new Set(filas.flatMap((v) => (v.cuidador_id ? [v.cuidador_id] : [])))]);
  const nombres = new Map(((perfiles.data ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre?.trim() || "Tu familiar"]));
  for (const v of filas) {
    if (!v.cuidador_id) continue;
    const d = salida.get(v.elder_id) ?? { nombre: nombres.get(v.elder_id) ?? "Tu familiar", cuidadores: [], prefs };
    d.cuidadores.push(v.cuidador_id);
    salida.set(v.elder_id, d);
  }
  return salida;
}
