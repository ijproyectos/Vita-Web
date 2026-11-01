import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  puedeReclamarOtroLote,
  sumarLotes,
  USUARIOS_POR_LOTE,
  type ResultadoLote,
} from "@/lib/admin/envios-masivos-logica";
import { entregarAviso } from "./avisos";

// Procesa los envíos masivos del panel (`envios_masivos`, migración 047) dentro del cron `dosis-vencidas`. Lo llama
// el route DESPUÉS de las alertas de dosis, que tienen prioridad. Recibe el cliente `service_role` del cron (único
// punto sancionado: el destino son muchos usuarios que la RLS de una sesión no deja tocar).
//
// Son ANUNCIOS DEL SERVICIO que mandan los dueños y administradores: a propósito NO respetan el silencio nocturno ni
// los toggles de `preferencias_avisos` (eso es de los avisos de medicación/turnos). Sí respetan el permiso del
// navegador: solo se envía a quien tiene una suscripción push, y se borran las muertas (404/410, lo hace enviarPush).
// Cada usuario recibe además UNA fila en su centro de avisos (tipo `admin_mensaje`) por envío: el cursor del lote es
// el último usuario procesado, así que ningún usuario se repite aunque dos ticks se superpongan.

type Cliente = SupabaseClient;

type LoteReclamado = { lt_envio_id: string; lt_titulo: string; lt_cuerpo: string; lt_enlace: string; lt_usuarios: string[] };

export type ResumenMasivos = ResultadoLote & { lotes: number };

const VACIO: ResumenMasivos = { usuarios: 0, enviados: 0, fallidos: 0, lotes: 0 };

async function procesarLote(admin: Cliente, lote: LoteReclamado): Promise<ResultadoLote> {
  const resultados = await Promise.all(
    lote.lt_usuarios.map(async (usuarioId) => {
      try {
        const { push } = await entregarAviso(
          admin,
          usuarioId,
          { tipo: "admin_mensaje", titulo: lote.lt_titulo, cuerpo: lote.lt_cuerpo, url: lote.lt_enlace },
          { title: lote.lt_titulo, body: lote.lt_cuerpo, url: lote.lt_enlace, tag: `admin-masivo-${lote.lt_envio_id}` },
        );
        return { enviados: push.enviados, fallidos: push.fallidos + (push.sinConfigurar ? push.total : 0) };
      } catch {
        return { enviados: 0, fallidos: 1 };
      }
    }),
  );
  return {
    usuarios: lote.lt_usuarios.length,
    enviados: resultados.reduce((a, r) => a + r.enviados, 0),
    fallidos: resultados.reduce((a, r) => a + r.fallidos, 0),
  };
}

/**
 * Reclama y envía lotes mientras quede presupuesto del cron (`inicioCronMs` = cuándo arrancó la ruta entera). Nunca
 * lanza: ante cualquier fallo corta y devuelve lo hecho; el próximo tick sigue donde quedó el cursor.
 */
export async function procesarEnviosMasivos(admin: Cliente, inicioCronMs: number): Promise<ResumenMasivos> {
  const lotes: ResultadoLote[] = [];
  try {
    while (puedeReclamarOtroLote(Date.now() - inicioCronMs, lotes.length)) {
      const { data, error } = await admin.rpc("reclamar_lote_envio_masivo", { p_limite: USUARIOS_POR_LOTE });
      if (error) break; // incluye la migración sin aplicar
      const lote = (Array.isArray(data) ? data[0] : data) as LoteReclamado | null;
      if (!lote || !Array.isArray(lote.lt_usuarios) || lote.lt_usuarios.length === 0) break; // nada pendiente o recién terminado
      const r = await procesarLote(admin, lote);
      lotes.push(r);
      await admin.rpc("registrar_progreso_envio_masivo", {
        p_id: lote.lt_envio_id,
        p_usuarios: r.usuarios,
        p_enviados: r.enviados,
        p_fallidos: r.fallidos,
      });
    }
  } catch {
    // Se devuelve lo que se alcanzó a hacer.
  }
  return lotes.length === 0 ? VACIO : { ...sumarLotes(lotes), lotes: lotes.length };
}
