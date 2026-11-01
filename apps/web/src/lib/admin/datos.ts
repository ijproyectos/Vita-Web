import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, type Admin } from "./acceso";
import {
  leerIA,
  leerResumen,
  leerSistema,
  leerUsuarioDetalle,
  leerUsuarios,
  leerVitaPlus,
  type PanelIA,
  type PanelSistema,
  type PanelVitaPlus,
  type Resumen,
  type UsuarioDetalle,
} from "./tipos";

export const FILTROS_USUARIOS = ["todos", "vita_plus", "inactivos_7", "inactivos_30", "gestionados", "sin_onboarding"] as const;
export type FiltroUsuarios = (typeof FILTROS_USUARIOS)[number];
export const TAMANO_PAGINA = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Entrada de cada página del panel: valida admin (404 si no lo es) y deja una fila de auditoría. La auditoría es
 * best-effort: si falla, la página igual se muestra.
 */
export async function entrarAlPanel(ruta: string): Promise<Admin> {
  const admin = await requireAdmin();
  try {
    const { error } = await createAdminClient()
      .from("admin_accesos")
      .insert({ admin_email: admin.email, ruta: ruta.slice(0, 300) });
    if (error) console.error("admin_accesos: no se pudo registrar el acceso");
  } catch {
    console.error("admin_accesos: no se pudo registrar el acceso");
  }
  return admin;
}

// Cada función de datos vuelve a exigir admin ANTES de crear el cliente `service_role`. Nunca lanza: null = falló.
async function rpc(nombre: string, args?: Record<string, unknown>): Promise<unknown | null> {
  await requireAdmin();
  try {
    const { data, error } = await createAdminClient().rpc(nombre, args);
    if (error) {
      console.error(`admin rpc ${nombre} falló`);
      return null;
    }
    return data;
  } catch {
    console.error(`admin rpc ${nombre} falló`);
    return null;
  }
}

export async function obtenerResumen(): Promise<Resumen | null> {
  const data = await rpc("admin_resumen");
  return data === null ? null : leerResumen(data);
}

export async function obtenerUsuarios(params: {
  busqueda: string;
  filtro: FiltroUsuarios;
  pagina: number;
}): Promise<ReturnType<typeof leerUsuarios> | null> {
  const pagina = Math.max(1, Math.floor(params.pagina) || 1);
  const data = await rpc("admin_usuarios", {
    p_busqueda: params.busqueda.slice(0, 100),
    p_filtro: params.filtro,
    p_limite: TAMANO_PAGINA,
    p_offset: (pagina - 1) * TAMANO_PAGINA,
  });
  return data === null ? null : leerUsuarios(data);
}

export type ResultadoUsuario = { estado: "ok"; datos: UsuarioDetalle } | { estado: "no_existe" } | { estado: "error" };

export async function obtenerUsuario(id: string): Promise<ResultadoUsuario> {
  if (!UUID.test(id)) {
    await requireAdmin();
    return { estado: "no_existe" };
  }
  const data = await rpc("admin_usuario", { p_id: id });
  if (data === null) return { estado: "error" };
  const datos = leerUsuarioDetalle(data);
  return datos ? { estado: "ok", datos } : { estado: "no_existe" };
}

export async function obtenerIA(dias: number): Promise<PanelIA | null> {
  const data = await rpc("admin_ia", { p_dias: dias });
  return data === null ? null : leerIA(data);
}

export async function obtenerVitaPlus(): Promise<PanelVitaPlus | null> {
  const data = await rpc("admin_vita_plus");
  return data === null ? null : leerVitaPlus(data);
}

export async function obtenerSistema(): Promise<PanelSistema | null> {
  const data = await rpc("admin_sistema");
  return data === null ? null : leerSistema(data);
}
