import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validarLimiteAdmin } from "@/lib/uso-ia/interacciones-logica";
import type { Admin } from "./acceso";
import { registrarAccionAdmin } from "./auditoria";

// Cambiar el límite diario de consultas con vita de una persona (migración 049). Lo pueden hacer dueños Y
// administradores; quien llama ya pasó por `requireAdmin()`. Nunca lanza. Se valida acá y otra vez en SQL.

export type ResultadoLimiteInteracciones = { status: "success"; mensaje: string } | { status: "error"; mensaje: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_GENERICO: ResultadoLimiteInteracciones = { status: "error", mensaje: "No pudimos guardar el límite. Probá de nuevo." };

export async function definirLimiteInteracciones(
  admin: Admin,
  usuarioId: string,
  entrada: { limite: unknown; motivo: unknown; volverAlGeneral?: unknown },
): Promise<ResultadoLimiteInteracciones> {
  if (!UUID.test(usuarioId)) return { status: "error", mensaje: "Usuario inválido." };
  const v = validarLimiteAdmin(entrada);
  if (!v.ok) return { status: "error", mensaje: v.mensaje };
  try {
    const { data, error } = await createAdminClient().rpc("admin_definir_limite_interacciones", {
      p_usuario: usuarioId,
      p_limite: v.limite,
      p_por: admin.email,
      p_motivo: v.motivo,
    });
    if (error) return { status: "error", mensaje: "No pudimos guardar el límite. Revisá que la migración 049 esté aplicada." };
    const fila = (Array.isArray(data) ? data[0] : data) as { d_resultado?: unknown; d_anterior?: unknown } | null;
    const resultado = fila?.d_resultado;
    if (resultado === "no_existe") return { status: "error", mensaje: "El usuario no existe." };
    if (resultado === "invalido") return { status: "error", mensaje: "El límite o el motivo no son válidos." };
    if (resultado !== "ok") return ERROR_GENERICO;
    const anterior = typeof fila?.d_anterior === "number" ? fila.d_anterior : null;
    // El motivo es texto libre del administrador: no se copia a la auditoría (solo si se indicó o no).
    await registrarAccionAdmin(admin.email, "limite_interacciones_definido", usuarioId, {
      limite_anterior: anterior,
      limite_nuevo: v.limite,
      con_motivo: v.motivo !== "",
    });
    return {
      status: "success",
      mensaje: v.limite === null ? "Listo: vuelve al límite general." : `Listo: ahora puede hacer ${v.limite} consultas por día.`,
    };
  } catch {
    return ERROR_GENERICO;
  }
}
