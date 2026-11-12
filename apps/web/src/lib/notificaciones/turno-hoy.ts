import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR } from "@/lib/medicamentos/nucleo";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import { entregarAviso, obtenerPreferenciasDe, reclamarEnvio } from "./avisos";
import { PREFERENCIAS_POR_DEFECTO } from "./avisos-tipos";
import { refDeterminista } from "./avisos-familia-reglas";
import { payloadTurnoHoy, payloadTurnoPersonaHoy } from "./mensajes";
import { minutosHastaTurno } from "./turno-hoy-logica";

type Cliente = SupabaseClient;

type TurnoLeido = {
  id: string;
  usuario_id: string;
  especialidad: string;
  profesional: string | null;
  lugar: string | null;
  fecha: string;
  hora: string;
  acompanado: boolean | null;
  llevar: unknown;
};

/**
 * Turno cargado para HOY (decisión del usuario 2026-11-12): el aviso "Hoy a las 15:30 tenés…" sale en el mismo
 * momento de guardarlo, a cualquier hora (no espera al cron ni mira el silencio nocturno). Le llega a la persona y
 * a todos sus cuidadores aceptados, incluido quien lo cargó (le sirve de recordatorio). Respeta los interruptores
 * de avisos de turnos. Usa los mismos claims que el cron (`turno_hoy` / `turno_persona_hoy`), así nunca sale dos
 * veces; si esto falla, el cron lo manda en el próximo tick.
 *
 * Uso sancionado del cliente admin (mismo criterio que `avisarTurnoAcompanado`): se crea RECIÉN después de leer
 * el turno con el cliente de SESIÓN (RLS: dueño o cuidador con permiso). Best-effort: nunca lanza.
 */
export async function avisarTurnoDeHoy(supabase: Cliente, turnoId: string): Promise<void> {
  try {
    const { data: fila } = await supabase
      .from("turnos")
      .select("id, usuario_id, especialidad, profesional, lugar, fecha, hora, acompanado, llevar")
      .eq("id", turnoId)
      .maybeSingle();
    const t = fila as TurnoLeido | null;
    if (!t) return;
    const ahora = new Date();
    if (t.fecha !== fechaEnAR(ahora) || minutosHastaTurno(t.fecha, t.hora, ahora.getTime()) <= 0) return;

    const admin = createAdminClient();
    const { data: vinculos } = await admin
      .from("vinculos_cuidador")
      .select("cuidador_id, rol, relacion")
      .eq("elder_id", t.usuario_id)
      .eq("estado", "aceptado");
    const cuidadores = ((vinculos ?? []) as { cuidador_id: string | null; rol: string | null; relacion: string | null }[]).filter(
      (v): v is { cuidador_id: string; rol: string | null; relacion: string | null } => !!v.cuidador_id && v.cuidador_id !== t.usuario_id
    );
    const prefs = await obtenerPreferenciasDe(admin, [t.usuario_id, ...cuidadores.map((c) => c.cuidador_id)]);
    const prefsDe = (id: string) => prefs.get(id) ?? PREFERENCIAS_POR_DEFECTO;

    const envios: Promise<unknown>[] = [];

    if (prefsDe(t.usuario_id).aviso_turnos) {
      envios.push(
        (async () => {
          if (!(await reclamarEnvio(admin, "turno_hoy", t.id, t.fecha, t.usuario_id))) return;
          const payload = payloadTurnoHoy({ turnoId: t.id, especialidad: t.especialidad, profesional: t.profesional, lugar: t.lugar, hora: t.hora, llevar: t.llevar });
          await entregarAviso(admin, t.usuario_id, { tipo: "turno_hoy", titulo: payload.title, cuerpo: payload.body, url: payload.url, datos: payload.datos }, payload);
        })()
      );
    }

    if (cuidadores.length > 0) {
      const { data: perfil } = await admin.from("perfiles").select("nombre").eq("id", t.usuario_id).maybeSingle();
      const crudo = (perfil?.nombre as string | null | undefined)?.trim().split(/\s+/)[0];
      const personaNombre = crudo ? nombreConMayuscula(crudo) : "Tu familiar";
      for (const c of cuidadores) {
        if (!prefsDe(c.cuidador_id).turnos_persona) continue;
        envios.push(
          (async () => {
            if (!(await reclamarEnvio(admin, "turno_persona_hoy", refDeterminista(t.usuario_id, c.cuidador_id, t.id), t.fecha, c.cuidador_id))) return;
            // Acompañado: ya le llegó "pidió compañía para su turno" con el día y la hora; se reclama igual
            // (así el cron tampoco lo manda) pero no se repite.
            if (t.acompanado) return;
            const payload = payloadTurnoPersonaHoy({
              personaId: t.usuario_id,
              personaNombre,
              turnoId: t.id,
              especialidad: t.especialidad,
              profesional: t.profesional,
              hora: t.hora,
              acompanado: t.acompanado,
              llevar: t.llevar,
              rolDestino: c.rol === "ver" ? "ver" : "editar",
              relacion: c.relacion,
            });
            await entregarAviso(
              admin,
              c.cuidador_id,
              { tipo: "turno_persona_hoy", titulo: payload.title, cuerpo: payload.body, url: payload.url, personaId: t.usuario_id, datos: { turnoId: t.id } },
              payload
            );
          })()
        );
      }
    }

    await Promise.allSettled(envios);
  } catch {
    console.warn("turno_hoy: falló el aviso (el turno ya está guardado)");
  }
}
