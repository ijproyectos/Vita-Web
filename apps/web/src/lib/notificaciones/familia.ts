import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaEnAR } from "@/lib/medicamentos/nucleo";
import { entregarAviso, familiaAvisosDisponible, reclamarEnvio } from "./avisos";
import { refDeterminista } from "./avisos-familia-reglas";
import { payloadPersonaEnVita } from "./mensajes";

type Cliente = SupabaseClient;

/**
 * "Elsa ya está en vita": una persona con perfil gestionado entró por primera
 * vez con el código de acceso. Fila en el feed (y push) de cada cuidador Admin
 * suyo. Código de sistema (cliente admin): solo se llama desde el flujo de
 * acceso por código, ya sancionado para usar service_role. Claim-before-send
 * por cuidador. Nunca lanza; sin la migración 028 no hace nada.
 */
export async function avisarPersonaEnVita(admin: Cliente, personaId: string): Promise<number> {
  try {
    if (!(await familiaAvisosDisponible(admin))) return 0;

    const { data: vinculos } = await admin
      .from("vinculos_cuidador")
      .select("cuidador_id")
      .eq("elder_id", personaId)
      .eq("estado", "aceptado")
      .eq("rol", "editar");
    const cuidadorIds = ((vinculos ?? []) as { cuidador_id: string | null }[])
      .map((v) => v.cuidador_id)
      .filter((id): id is string => Boolean(id));
    if (cuidadorIds.length === 0) return 0;

    const { data: perfil } = await admin.from("perfiles").select("nombre").eq("id", personaId).maybeSingle();
    const personaNombre = (perfil as { nombre: string | null } | null)?.nombre?.trim() || "Tu familiar";
    const payload = payloadPersonaEnVita({ personaId, personaNombre });
    const hoyAR = fechaEnAR(new Date());

    let enviados = 0;
    for (const cuidadorId of cuidadorIds) {
      if (!(await reclamarEnvio(admin, "persona_en_vita", refDeterminista(personaId, cuidadorId), hoyAR, cuidadorId))) continue;
      await entregarAviso(
        admin,
        cuidadorId,
        { tipo: "persona_en_vita", titulo: payload.title, cuerpo: payload.body, url: payload.url, personaId, datos: { personaId } },
        payload
      );
      enviados++;
    }
    return enviados;
  } catch {
    return 0;
  }
}
