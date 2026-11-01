import "server-only";

import { entregarAviso } from "@/lib/notificaciones/avisos";
import type { PayloadPush } from "@/lib/notificaciones/push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "./acceso";
import { registrarAccionAdmin } from "./auditoria";
import { clavePush, inicioVentanaPush, superaLimitePush, validarMensajePush } from "./push-form";

export type ResultadoPushAdmin = { status: "success"; mensaje: string } | { status: "error"; mensaje: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_GENERICO: ResultadoPushAdmin = { status: "error", mensaje: "No pudimos enviar la notificación. Probá de nuevo." };

/**
 * Manda una notificación push a todos los dispositivos de un usuario y deja el aviso en su centro de avisos
 * (tipo `admin_mensaje`). Recibe el `Admin` que devolvió `requireAdmin()` (prueba de sesión + segundo factor) y
 * recién entonces crea el cliente `service_role` (uso sancionado, ver `lib/supabase/admin.ts`): el destino es otro
 * usuario, que la RLS de la sesión no deja tocar. Máx. 10 por hora por admin; cada envío queda auditado. Nunca lanza.
 */
export async function enviarMensajeAUsuario(admin: Admin, usuarioId: string, titulo: unknown, cuerpo: unknown): Promise<ResultadoPushAdmin> {
  if (!UUID.test(usuarioId)) return { status: "error", mensaje: "Usuario inválido." };
  const v = validarMensajePush({ titulo, cuerpo });
  if (!v.ok) return { status: "error", mensaje: v.error };

  try {
    const cliente = createAdminClient();
    // Incremento atómico y después chequeo (`contar_pedido`), no "leer y sumar". Falla cerrado: si no se puede
    // contar, no se manda (el límite es lo que evita un envío masivo por error).
    const { data: cuenta, error: errorConteo } = await cliente.rpc("contar_pedido", {
      p_clave: clavePush(admin.email),
      p_ventana_inicio: inicioVentanaPush(Date.now()).toISOString(),
    });
    if (errorConteo || typeof cuenta !== "number") return ERROR_GENERICO;
    if (superaLimitePush(cuenta)) return { status: "error", mensaje: "Llegaste al máximo de 10 notificaciones por hora. Probá más tarde." };

    const { data: existe, error: errorUsuario } = await cliente.auth.admin.getUserById(usuarioId);
    if (errorUsuario || !existe?.user) return { status: "error", mensaje: "El usuario no existe." };

    const payload: PayloadPush = {
      title: v.mensaje.titulo,
      body: v.mensaje.cuerpo,
      url: "/app/avisos",
      tag: "admin-mensaje",
    };
    const { feed, push } = await entregarAviso(
      cliente,
      usuarioId,
      { tipo: "admin_mensaje", titulo: v.mensaje.titulo, cuerpo: v.mensaje.cuerpo, url: "/app/avisos" },
      payload,
    );

    await registrarAccionAdmin(admin.email, "push_enviado", usuarioId, {
      titulo: v.mensaje.titulo,
      dispositivos: push.total,
      enviados: push.enviados,
      fallidos: push.fallidos,
      aviso_en_feed: feed,
    });

    const enFeed = feed ? " Quedó también en su centro de avisos." : "";
    if (push.sinConfigurar) {
      return { status: "error", mensaje: `Las notificaciones push no están configuradas en el servidor (VAPID).${enFeed}` };
    }
    if (push.total === 0) return { status: "success", mensaje: `Sin suscripciones: el usuario no tiene dispositivos con push.${enFeed}` };
    if (push.enviados === 0) return { status: "error", mensaje: `No se pudo entregar a ninguno de sus ${push.total} dispositivos.${enFeed}` };
    const parte = push.fallidos > 0 ? ` (${push.fallidos} fallaron)` : "";
    return { status: "success", mensaje: `Enviada a ${push.enviados} ${push.enviados === 1 ? "dispositivo" : "dispositivos"}${parte}.${enFeed}` };
  } catch {
    return ERROR_GENERICO;
  }
}
