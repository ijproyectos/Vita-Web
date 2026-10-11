import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET_ESTUDIOS = "estudios";
const PAGINA = 100;

export type ResultadoEliminarCuenta = { ok: true } | { ok: false; error: string };

/**
 * Elimina por completo la cuenta de un usuario y todos sus datos.
 *
 * Toda tabla de negocio referencia auth.users con `on delete cascade`
 * (perfiles, medicamentos, tomas, turnos, estudios, chat, vínculos de
 * cuidador en ambas direcciones, borradores pendientes, uso de IA), así
 * que borrar el usuario de Auth arrastra todas las filas. Lo único que NO
 * cascadea son los archivos de Storage — por eso se borran primero: si
 * fallara después, el usuario sigue existiendo y puede reintentar, en vez
 * de quedar fotos de estudios huérfanas sin dueño.
 *
 * La identidad de Google (única integración real) vive en auth.identities
 * y se borra junto con el usuario.
 *
 * Usa el cliente service_role: borrar un usuario de Auth no se puede con
 * una sesión normal. `usuarioId` tiene que venir SIEMPRE de la sesión
 * verificada (requireUser), nunca de un input del cliente.
 */
export async function eliminarCuenta(usuarioId: string): Promise<ResultadoEliminarCuenta> {
  const admin = createAdminClient();

  // 1. Archivos de estudios: carpeta `<usuarioId>/` del bucket privado.
  for (;;) {
    const { data: archivos, error } = await admin.storage
      .from(BUCKET_ESTUDIOS)
      .list(usuarioId, { limit: PAGINA });
    if (error) return { ok: false, error: "No se pudieron borrar tus estudios." };
    if (!archivos || archivos.length === 0) break;

    const rutas = archivos.map((a) => `${usuarioId}/${a.name}`);
    const { error: errorBorrado } = await admin.storage.from(BUCKET_ESTUDIOS).remove(rutas);
    if (errorBorrado) return { ok: false, error: "No se pudieron borrar tus estudios." };
    if (archivos.length < PAGINA) break;
  }

  // 2. Usuario de Auth — cascadea a todas las tablas.
  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) return { ok: false, error: "No se pudo eliminar tu cuenta. Intentá de nuevo." };

  return { ok: true };
}
