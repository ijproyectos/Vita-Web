import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { aMonitoreo } from "@/lib/mediciones/planes-nucleo";
import { esDeLaMetrica, fraseMedir, planAplica, tramosDeHoy, type Monitoreo } from "@/lib/mediciones/plan";
import { hrefNuevaMedicion, type Medicion } from "@/lib/mediciones/tipos";
import type { DiaSemana } from "@/lib/medicamentos/tipos";
import { entregarAviso, obtenerPreferenciasDe, reclamarEnvio } from "./avisos";
import { enSilencioNocturno, minutosDesde, PREFERENCIAS_POR_DEFECTO } from "./avisos-tipos";
import { refDeterminista } from "./avisos-familia-reglas";

type FilaMedicion = Pick<Medicion, "usuario_id" | "tipo" | "nombre_otra" | "medido_at">;

/**
 * "Hora de medir…" a la hora de cada plan, salvo que ya se haya medido. Respeta
 * el silencio nocturno y cada plan se apaga desde su detalle; el diseño no
 * trae un interruptor general. Sin la migración 053 no hace nada.
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
  const [prefs, mediciones] = await Promise.all([
    obtenerPreferenciasDe(admin, usuarios),
    admin.from("mediciones").select("usuario_id, tipo, nombre_otra, medido_at").in("usuario_id", usuarios).gte("medido_at", `${hoyAR}T00:00:00-03:00`),
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

    const titulo = `Hora de medir ${fraseMedir(plan)}`;
    const cuerpo = "Tocá para cargar el valor.";
    const url = hrefNuevaMedicion({ tipo: plan.tipo, nombre: plan.nombre_otra, unidad: plan.unidad_otra, volver: "/app/avisos" });
    await entregarAviso(
      admin,
      plan.usuario_id,
      { tipo: "medicion", titulo, cuerpo, url, datos: { monitoreoId: plan.id } },
      { title: titulo, body: cuerpo, url, tag: `medir-${plan.id}-${hora}`, renotify: true, datos: { monitoreoId: plan.id } }
    );
    enviados++;
  }
  return enviados;
}
