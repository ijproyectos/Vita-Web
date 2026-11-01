import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  BAN_LEVANTAR,
  BAN_SUSPENDER,
  puedeSuspender,
  validarSuspension,
} from "@/lib/suspensiones/logica";
import type { Admin } from "./acceso";
import { registrarAccionAdmin } from "./auditoria";
import { parsearAdminEmails } from "./decision";

// Suspender / reactivar cuentas de la app desde el panel. Dos capas: (a) ban de Supabase Auth (no puede iniciar
// sesión ni renovarla) y (b) fila en `suspensiones` (la app muestra /suspendida y las APIs responden 403). Uso
// sancionado de la Auth Admin API (ver lib/supabase/admin.ts). NO borra ni altera datos de la persona. Nunca lanza.

export type ResultadoSuspension = { status: "success"; mensaje: string } | { status: "error"; mensaje: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_GENERICO: ResultadoSuspension = { status: "error", mensaje: "No pudimos completar el pedido. Probá de nuevo." };

export async function suspenderCuenta(admin: Admin, usuarioId: string, motivo: unknown, nota: unknown): Promise<ResultadoSuspension> {
  if (!UUID.test(usuarioId)) return { status: "error", mensaje: "Usuario inválido." };
  const v = validarSuspension({ motivo, nota });
  if (!v.ok) return { status: "error", mensaje: v.mensaje };

  try {
    const cliente = createAdminClient();
    const { data: existe, error: errorUsuario } = await cliente.auth.admin.getUserById(usuarioId);
    if (errorUsuario || !existe?.user) return { status: "error", mensaje: "El usuario no existe." };

    // Nunca a un dueño (ADMIN_EMAILS) ni a un administrador activo. La función SQL repite el chequeo de administradores.
    const email = existe.user.email?.trim().toLowerCase() ?? null;
    let administradores: string[] = [];
    if (email) {
      const { data: esAdmin, error: errorAdmin } = await cliente.rpc("admin_es_administrador", { p_email: email });
      if (errorAdmin) return ERROR_GENERICO; // sin poder confirmarlo, no se suspende
      if (esAdmin === true) administradores = [email];
    }
    const guardia = puedeSuspender(email, parsearAdminEmails(process.env.ADMIN_EMAILS), administradores);
    if (!guardia.ok) return { status: "error", mensaje: guardia.mensaje };

    const { data: resultado, error } = await cliente.rpc("admin_suspender_usuario", {
      p_usuario: usuarioId,
      p_motivo: v.motivo,
      p_nota: v.nota,
      p_por: admin.email,
    });
    if (error) return { status: "error", mensaje: "No pudimos suspender la cuenta. Revisá que la migración 047 esté aplicada." };
    if (resultado === "ya_suspendida") return { status: "error", mensaje: "La cuenta ya está suspendida." };
    if (resultado === "protegida") return { status: "error", mensaje: "No se puede suspender a un administrador del panel." };
    if (resultado === "no_existe") return { status: "error", mensaje: "El usuario no existe." };
    if (resultado !== "ok") return ERROR_GENERICO;

    const { error: errorBan } = await cliente.auth.admin.updateUserById(usuarioId, { ban_duration: BAN_SUSPENDER });
    await registrarAccionAdmin(admin.email, "cuenta_suspendida", usuarioId, { motivo: v.motivo, ban_auth: !errorBan });
    if (errorBan) {
      return {
        status: "success",
        mensaje: "La cuenta quedó suspendida en la app, pero no se pudo aplicar el bloqueo de inicio de sesión. Reactivá y volvé a suspender para reintentarlo.",
      };
    }
    return { status: "success", mensaje: "Cuenta suspendida. No va a poder ingresar y verá el motivo en la app." };
  } catch {
    return ERROR_GENERICO;
  }
}

export async function reactivarCuenta(admin: Admin, usuarioId: string): Promise<ResultadoSuspension> {
  if (!UUID.test(usuarioId)) return { status: "error", mensaje: "Usuario inválido." };
  try {
    const cliente = createAdminClient();
    // Primero se levanta el ban: si fallara, no se toca la fila y se puede reintentar sin dejar a nadie bloqueado a medias.
    const { error: errorBan } = await cliente.auth.admin.updateUserById(usuarioId, { ban_duration: BAN_LEVANTAR });
    if (errorBan) return { status: "error", mensaje: "No pudimos levantar el bloqueo de inicio de sesión. Probá de nuevo." };
    const { data, error } = await cliente.rpc("admin_reactivar_usuario", { p_usuario: usuarioId, p_por: admin.email });
    if (error) return ERROR_GENERICO;
    if (data !== true) return { status: "error", mensaje: "La cuenta no estaba suspendida." };
    await registrarAccionAdmin(admin.email, "cuenta_reactivada", usuarioId, {});
    return { status: "success", mensaje: "Cuenta reactivada." };
  } catch {
    return ERROR_GENERICO;
  }
}
