import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Auditoría de acciones del panel (tabla `admin_acciones`, migración 046). Siempre se llama DESPUÉS de `requireAdmin`.
// El detalle nunca lleva texto libre más allá del título de un mensaje: ni cuerpos, ni emails de terceros.

export type AccionAdmin = "push_enviado" | "codigo_creado" | "codigo_revocado";

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

/** Cuántas veces hizo `accion` este admin en la última hora. null = no se pudo saber (quien llama decide si frena). */
export async function contarAccionesUltimaHora(adminEmail: string, accion: AccionAdmin): Promise<number | null> {
  try {
    const desde = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error } = await createAdminClient()
      .from("admin_acciones")
      .select("id", { count: "exact", head: true })
      .eq("admin_email", adminEmail)
      .eq("accion", accion)
      .gte("created_at", desde);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}
