import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Auditoría de acciones del panel (tabla `admin_acciones`, migración 046). Siempre se llama DESPUÉS de `requireAdmin`.
// El detalle nunca lleva texto libre más allá del título de un mensaje: ni cuerpos de mensajes ni notas internas.
// El único email de un tercero que se registra es el del administrador que se agrega o se quita.

export type AccionAdmin =
  | "push_enviado"
  | "codigo_creado"
  | "codigo_revocado"
  | "admin_agregado"
  | "admin_revocado"
  | "cuenta_suspendida"
  | "cuenta_reactivada"
  | "limite_interacciones_definido"
  | "envio_masivo_creado"
  | "envio_masivo_cancelado";

/** Best-effort: una auditoría que falla no tumba la acción (se loguea sin datos). */
export async function registrarAccionAdmin(
  adminEmail: string,
  accion: AccionAdmin,
  objetivoId: string | null,
  detalle: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("admin_acciones")
      .insert({ admin_email: adminEmail, accion, objetivo_id: objetivoId, detalle });
    if (error) console.error("admin_acciones: no se pudo registrar la acción");
  } catch {
    console.error("admin_acciones: no se pudo registrar la acción");
  }
}
