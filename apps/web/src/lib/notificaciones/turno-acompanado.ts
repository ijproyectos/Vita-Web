import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearAviso } from "./avisos";
import { payloadTurnoAcompanado } from "./mensajes";
import { enviarPush } from "./push";
import {
  debeAvisarAcompanado,
  destinatariosAcompanado,
  type EstadoTurnoAcompanado,
  type VinculoCrudo,
} from "./turno-acompanado-logica";

type Cliente = SupabaseClient;

type TurnoGuardado = EstadoTurnoAcompanado & { id: string; usuario_id: string; especialidad: string };

/**
 * "Voy a ir acompañado" (decisión del dueño 2026-10-30): avisa a los cuidadores ACEPTADOS del dueño del turno
 * con una fila en su feed (`turno_acompanado`, con `persona_id` para el filtro de familia) + push. Se llama desde
 * el núcleo de turnos tras guardar, así que todo camino (formulario, edición inline, chat, onboarding) lo hereda.
 *
 * Uso sancionado del cliente admin (ver `lib/supabase/admin.ts`): los avisos y las suscripciones son del
 * cuidador y quien guarda el turno no puede escribirlos con su sesión. El admin se crea RECIÉN después de
 * autorizar con el cliente de SESIÓN: el turno recién escrito tiene que ser visible para esa sesión (RLS: dueño
 * o cuidador con rol editar) y el actor sale de la sesión, nunca del cliente. Se excluye al actor.
 * Best-effort: nunca lanza ni bloquea el guardado del turno.
 */
export async function avisarTurnoAcompanado(
  supabase: Cliente,
  turnoId: string,
  previo: EstadoTurnoAcompanado | null
): Promise<void> {
  try {
    const { data: fila } = await supabase
      .from("turnos")
      .select("id, usuario_id, especialidad, fecha, hora, acompanado")
      .eq("id", turnoId)
      .maybeSingle();
    const turno = fila as TurnoGuardado | null;
    if (!turno) return;
    if (!debeAvisarAcompanado(previo, { acompanado: turno.acompanado === true, fecha: turno.fecha, hora: turno.hora })) return;

    const { data: sesion } = await supabase.auth.getUser();
    const actorId = sesion.user?.id ?? null;

    // Turno visible para la sesión = autorización resuelta: recién ahora el cliente admin.
    const admin = createAdminClient();
    const { data: vinculos, error } = await admin
      .from("vinculos_cuidador")
      .select("cuidador_id, estado")
      .eq("elder_id", turno.usuario_id)
      .eq("estado", "aceptado");
    if (error) return;
    const destinatarios = destinatariosAcompanado((vinculos ?? []) as VinculoCrudo[], actorId, turno.usuario_id);
    if (destinatarios.length === 0) return;

    const { data: perfil } = await admin.from("perfiles").select("nombre").eq("id", turno.usuario_id).maybeSingle();
    const crudo = (perfil?.nombre as string | null | undefined)?.trim().split(/\s+/)[0];
    const payload = payloadTurnoAcompanado({
      personaId: turno.usuario_id,
      personaNombre: crudo ? nombreConMayuscula(crudo) : "Tu familiar",
      turnoId: turno.id,
      especialidad: turno.especialidad,
      fecha: turno.fecha,
      hora: turno.hora,
    });

    await Promise.all(
      destinatarios.map(async (cuidadorId) => {
        try {
          await crearAviso(admin, cuidadorId, {
            tipo: "turno_acompanado",
            titulo: payload.title,
            cuerpo: payload.body,
            url: payload.url,
            datos: { personaId: turno.usuario_id, turnoId: turno.id },
            personaId: turno.usuario_id,
          });
          await enviarPush(admin, cuidadorId, payload);
        } catch {
          console.warn("turno_acompanado: no se pudo avisar a un cuidador");
        }
      })
    );
  } catch {
    console.warn("turno_acompanado: falló el aviso (el turno ya está guardado)");
  }
}
