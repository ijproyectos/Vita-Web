import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "./acceso";
import { registrarAccionAdmin } from "./auditoria";
import { esEstadoEnvio, textoEspera, validarEnvioMasivo, type EstadoEnvio } from "./envios-masivos-logica";

// Envíos masivos de push desde el panel. Acá solo se CREA el trabajo (`envios_masivos`) y se cancela; el envío real
// lo hace el cron `dosis-vencidas` por lotes (lib/notificaciones/masivos.ts), porque una función de Netlify muere
// a los ~10 s. Cada función recibe el `Admin` de `requireAdmin()`. Dueños y administradores pueden enviar y cancelar.
// Nunca lanza.

export type FilaEnvio = {
  id: string;
  titulo: string;
  enlace: string;
  creadoPor: string;
  creado: string;
  estado: EstadoEnvio;
  totalUsuarios: number;
  totalDispositivos: number;
  usuariosProcesados: number;
  enviados: number;
  fallidos: number;
  terminado: string | null;
};

export type PanelEnvios = {
  destinatarios: { usuarios: number; dispositivos: number } | null;
  envios: FilaEnvio[] | null;
};

type FilaDb = {
  id: string;
  titulo: string;
  enlace: string;
  creado_por: string;
  created_at: string;
  estado: string;
  total_usuarios: number;
  total_dispositivos: number;
  usuarios_procesados: number;
  enviados: number;
  fallidos: number;
  terminado_at: string | null;
};

export async function leerPanelEnvios(admin: Admin): Promise<PanelEnvios> {
  void admin; // el tipo es la prueba de que ya pasó requireAdmin()
  const cliente = createAdminClient();
  let destinatarios: PanelEnvios["destinatarios"] = null;
  let envios: PanelEnvios["envios"] = null;
  try {
    const { data, error } = await cliente.rpc("admin_destinatarios_masivos");
    const fila = (Array.isArray(data) ? data[0] : data) as { o_usuarios?: unknown; o_dispositivos?: unknown } | null;
    if (!error && fila) destinatarios = { usuarios: Number(fila.o_usuarios) || 0, dispositivos: Number(fila.o_dispositivos) || 0 };
  } catch {
    destinatarios = null;
  }
  try {
    // Sin el cuerpo: la lista solo necesita el título (y es lo único que se audita).
    const { data, error } = await cliente
      .from("envios_masivos")
      .select("id, titulo, enlace, creado_por, created_at, estado, total_usuarios, total_dispositivos, usuarios_procesados, enviados, fallidos, terminado_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data) {
      envios = (data as FilaDb[]).map((f) => ({
        id: f.id,
        titulo: f.titulo,
        enlace: f.enlace,
        creadoPor: f.creado_por,
        creado: f.created_at,
        estado: esEstadoEnvio(f.estado) ? f.estado : "pendiente",
        totalUsuarios: f.total_usuarios,
        totalDispositivos: f.total_dispositivos,
        usuariosProcesados: f.usuarios_procesados,
        enviados: f.enviados,
        fallidos: f.fallidos,
        terminado: f.terminado_at,
      }));
    }
  } catch {
    envios = null;
  }
  return { destinatarios, envios };
}

export type ResultadoEnvio = { ok: true; mensaje: string } | { ok: false; mensaje: string };

export async function crearEnvioMasivo(admin: Admin, crudo: { titulo: unknown; cuerpo: unknown; enlace: unknown }): Promise<ResultadoEnvio> {
  const v = validarEnvioMasivo(crudo);
  if (!v.ok) return { ok: false, mensaje: v.error };
  try {
    const { data, error } = await createAdminClient().rpc("crear_envio_masivo", {
      p_titulo: v.envio.titulo,
      p_cuerpo: v.envio.cuerpo,
      p_enlace: v.envio.enlace,
      p_por: admin.email,
    });
    const fila = (Array.isArray(data) ? data[0] : data) as
      | { cr_id?: unknown; cr_resultado?: unknown; cr_espera_seg?: unknown; cr_usuarios?: unknown; cr_dispositivos?: unknown }
      | null;
    if (error || !fila) return { ok: false, mensaje: "No pudimos crear el envío. Revisá que la migración 047 esté aplicada." };
    switch (fila.cr_resultado) {
      case "ok": {
        const id = typeof fila.cr_id === "string" ? fila.cr_id : null;
        const usuarios = Number(fila.cr_usuarios) || 0;
        const dispositivos = Number(fila.cr_dispositivos) || 0;
        // Solo el título: nunca el cuerpo del mensaje.
        await registrarAccionAdmin(admin.email, "envio_masivo_creado", id, { titulo: v.envio.titulo, usuarios, dispositivos });
        return { ok: true, mensaje: `Envío en cola para ${usuarios} ${usuarios === 1 ? "persona" : "personas"} (${dispositivos} dispositivos). Sale en lotes cada pocos minutos.` };
      }
      case "en_curso":
        return { ok: false, mensaje: "Hay otro envío pendiente o en curso. Esperá a que termine o cancelalo." };
      case "limite":
        return { ok: false, mensaje: `Solo se puede hacer un envío masivo cada 10 minutos. Probá en ${textoEspera(Number(fila.cr_espera_seg) || 600)}.` };
      case "sin_destinatarios":
        return { ok: false, mensaje: "Nadie tiene las notificaciones activadas todavía." };
      default:
        return { ok: false, mensaje: "El mensaje o el enlace no son válidos." };
    }
  } catch {
    return { ok: false, mensaje: "No pudimos crear el envío. Probá de nuevo." };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelarEnvioMasivo(admin: Admin, id: unknown): Promise<ResultadoEnvio> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, mensaje: "Envío inválido." };
  try {
    const { data, error } = await createAdminClient().rpc("cancelar_envio_masivo", { p_id: id, p_por: admin.email });
    if (error) return { ok: false, mensaje: "No pudimos cancelar el envío. Probá de nuevo." };
    if (data !== true) return { ok: false, mensaje: "Ese envío ya terminó o ya estaba cancelado." };
    await registrarAccionAdmin(admin.email, "envio_masivo_cancelado", id, {});
    return { ok: true, mensaje: "Envío cancelado. Lo que ya salió no se puede retirar." };
  } catch {
    return { ok: false, mensaje: "No pudimos cancelar el envío. Probá de nuevo." };
  }
}
